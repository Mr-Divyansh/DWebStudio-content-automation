/**
 * TELEGRAM CONNECTION ADAPTER
 * ============================================================================
 * Official, supported mechanism only: the Telegram Login Widget
 * (https://core.telegram.org/widgets/login/).
 *
 * User experience:  Connect Telegram -> Telegram's own authorization prompt
 *                   -> Connected
 *
 * WHAT IS DELIBERATELY NOT DONE
 *  - We NEVER ask for, receive, or store a Telegram password or phone-number
 *    code. The widget authenticates entirely inside Telegram.
 *  - We do not run a bot that reads the user's chats. Connecting proves
 *    identity only; messaging still requires a separately configured bot.
 *  - We store the Telegram user id (a public identifier), never a secret. A
 *    Telegram connection therefore has NO access token at all — there is
 *    nothing for us to leak, which is the correct posture for this platform.
 *
 * VERIFICATION (the reason a connection can be marked CONNECTED):
 *   Telegram signs the widget payload. We rebuild the data-check-string, hash
 *   it with HMAC-SHA256 keyed by SHA256(bot_token), and compare in constant
 *   time against the supplied `hash`, then enforce auth_date freshness.
 *
 * ONE-TIME DEVELOPER SETUP (admin only, never repeated by a normal user):
 *   Create a bot with @BotFather, run /setdomain with this app's domain, and set
 *   TELEGRAM_BOT_ID + TELEGRAM_BOT_USERNAME + TELEGRAM_BOT_TOKEN on the server.
 */

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { ConnectionService } from './connectionService.js';
import { ConnectionError, type VerifiedConnection, type Platform } from './types.js';
import type { AdapterStartResult, PlatformAdapter } from './adapterTypes.js';

/** Telegram auth data older than this is rejected as a replay. */
const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

export function telegramConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    botId: (env.TELEGRAM_BOT_ID ?? '').trim(),
    botUsername: (env.TELEGRAM_BOT_USERNAME ?? '').trim().replace(/^@/, ''),
    botToken: (env.TELEGRAM_BOT_TOKEN ?? '').trim(),
  };
}

export function isTelegramConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const cfg = telegramConfig(env);
  return Boolean(cfg.botId && cfg.botUsername && cfg.botToken);
}

export interface TelegramAuthPayload {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
}

/**
 * Verifies a Telegram Login Widget payload exactly as Telegram documents:
 *   data_check_string = sorted "key=value" lines joined by "\n"
 *   secret_key        = SHA256(bot_token)
 *   expected          = hex(HMAC_SHA256(data_check_string, secret_key))
 * Returns the trusted fields, or throws. No field is trusted before the check.
 */
export function verifyTelegramAuth(payload: TelegramAuthPayload, botToken: string): {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  authDate: number;
} {
  if (!payload || typeof payload.hash !== 'string' || !payload.hash) {
    throw new ConnectionError('Telegram did not return a valid authorization.', 400, 'TELEGRAM_BAD_PAYLOAD');
  }
  const authDate = Number(payload.auth_date);
  if (!Number.isFinite(authDate)) {
    throw new ConnectionError('Telegram authorization is missing a timestamp.', 400, 'TELEGRAM_BAD_PAYLOAD');
  }
  if (Math.floor(Date.now() / 1000) - authDate > MAX_AUTH_AGE_SECONDS) {
    throw new ConnectionError('This Telegram authorization has expired. Please connect again.', 400, 'TELEGRAM_EXPIRED');
  }

  // `hash` itself is never part of the signed string.
  const checkString = Object.entries(payload)
    .filter(([key, value]) => key !== 'hash' && value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = createHash('sha256').update(botToken).digest();
  const expected = createHmac('sha256', secretKey).update(checkString).digest('hex');

  // Constant-time compare: a naive === would leak the correct prefix length.
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(payload.hash, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ConnectionError('Telegram authorization could not be verified.', 400, 'TELEGRAM_SIGNATURE_INVALID');
  }

  return {
    id: String(payload.id),
    firstName: String(payload.first_name ?? ''),
    lastName: String(payload.last_name ?? ''),
    username: String(payload.username ?? ''),
    authDate,
  };
}

const adapter: PlatformAdapter = {
  platform: 'TELEGRAM' as Platform,

  isConfigured(): boolean {
    return isTelegramConfigured();
  },

  unavailableReason(): string | null {
    return isTelegramConfigured() ? null : 'Telegram sign-in has not been set up by the administrator yet.';
  },

  /**
   * The Telegram widget is rendered on our own page, so the "start" step only
   * returns the public bot identity the widget script needs. The bot TOKEN is
   * never sent to the browser — it is only used server-side to verify the HMAC.
   */
  async start(): Promise<AdapterStartResult> {
    const cfg = telegramConfig();
    if (!isTelegramConfigured()) {
      throw new ConnectionError('Telegram sign-in is not available yet.', 503, 'TELEGRAM_NOT_CONFIGURED');
    }
    return {
      kind: 'client',
      payload: { bot_id: cfg.botId, bot_username: cfg.botUsername },
    };
  },

  /**
   * Verifies the signed widget payload and returns the identity.
   * No token is returned because Telegram's Login Widget issues none.
   */
  async complete(input: Record<string, unknown>): Promise<VerifiedConnection> {
    const cfg = telegramConfig();
    if (!isTelegramConfigured()) {
      throw new ConnectionError('Telegram sign-in is not available yet.', 503, 'TELEGRAM_NOT_CONFIGURED');
    }
    // Single-use state binds this response to the session that opened the widget,
    // so a captured widget response cannot be replayed by another user.
    //
    // `__consumedState` is set by telegramCallbackHandler, which already consumed
    // the state while resolving which user to attach the account to. Consuming
    // twice would (correctly) fail, so it is skipped on that path.
    if (input.__consumedState !== true) {
      const consumed = await ConnectionService.consumeState('TELEGRAM', String(input.state ?? ''), null);
      if (!consumed) throw new ConnectionError('This Telegram authorization is no longer valid.', 400, 'TELEGRAM_STATE_INVALID');
    }

    const verified = verifyTelegramAuth(input as unknown as TelegramAuthPayload, cfg.botToken);
    const displayName = [verified.firstName, verified.lastName].filter(Boolean).join(' ').trim() || verified.username || null;

    return {
      externalAccountId: verified.id,
      displayName,
      username: verified.username || null,
      scopes: ['telegram_login_identity'],
      // Telegram's Login Widget issues no token, so we store none. Storing an
      // empty token would be storing a credential the platform never gave us.
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      metadata: { telegramUserId: verified.id, telegramUsername: verified.username, botId: cfg.botId },
    };
  },

  /** Telegram's widget issues no token, so there is nothing to revoke remotely. */
  async revoke(): Promise<void> {
    /* intentionally empty — see complete() for why there is no stored token */
  },

  /**
   * Telegram provides no introspection endpoint for Login Widget identities, so
   * verification is limited to the cryptographic proof we stored at connect
   * time. This is stated honestly rather than faking a live API check.
   */
  async verify(userId: string): Promise<{ ok: boolean; detail: string }> {
    const summary = await ConnectionService.findForUser(userId, 'TELEGRAM');
    if (!summary?.connected) return { ok: false, detail: 'No Telegram account is connected.' };
    return { ok: true, detail: 'Telegram verified this identity when it was connected.' };
  },
};

export default adapter;