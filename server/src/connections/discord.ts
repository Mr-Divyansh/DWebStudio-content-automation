/**
 * DISCORD CONNECTION ADAPTER
 * ============================================================================
 * Official, supported mechanism only: the Discord OAuth2 Authorization Code
 * grant with PKCE (https://discord.com/developers/docs/topics/oauth2).
 *
 * User experience:  Connect Discord -> Discord's own login/authorization page
 *                   -> Connected
 *
 * WHAT IS DELIBERATELY NOT DONE
 *  - No Discord password is ever collected by us. Discord authenticates the
 *    user on its own domain; we only receive an authorization code.
 *  - No bot token is requested at connect time and no guild is joined silently.
 *  - No token is ever returned to the browser.
 *
 * ONE-TIME DEVELOPER SETUP (done once by the D Web Studio admin, not per user):
 *   Discord Developer Portal -> New Application -> OAuth2 -> add redirect URI
 *   `${APP_URL}/api/connections/discord/callback`. Set DISCORD_CLIENT_ID and
 *   DISCORD_CLIENT_SECRET in the server environment.
 */

import { createHash } from 'node:crypto';
import { ConnectionService } from './connectionService.js';
import { ConnectionError, type VerifiedConnection, type Platform } from './types.js';
import type { AdapterStartContext, AdapterStartResult, PlatformAdapter } from './adapterTypes.js';

const AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const REVOKE_URL = 'https://discord.com/api/oauth2/token/revoke';
const ME_URL = 'https://discord.com/api/v10/users/@me';

/**
 * `identify` is the minimum scope that proves the grant is real: it returns the
 * authorized user's id, username and avatar. Nothing else is requested, so
 * connecting a Discord account grants no message-sending rights.
 */
export const DISCORD_SCOPES = ['identify', 'email'];

export function discordConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    clientId: (env.DISCORD_CLIENT_ID ?? '').trim(),
    clientSecret: (env.DISCORD_CLIENT_SECRET ?? '').trim(),
    redirectUri: `${(env.APP_URL ?? '').trim().replace(/\/+$/, '')}/api/connections/discord/callback`,
  };
}

export function isDiscordConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const cfg = discordConfig(env);
  return Boolean(cfg.clientId && cfg.clientSecret);
}

/** PKCE S256 challenge derived from the server-held verifier. */
function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

async function postForm(url: string, body: Record<string, string>): Promise<Record<string, any>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) {
    // Discord's error body carries no secret worth echoing, so it is not logged.
    throw new ConnectionError('Discord could not complete the sign-in. Please try again.', 400, 'DISCORD_TOKEN_EXCHANGE_FAILED');
  }
  return json;
}

const adapter: PlatformAdapter = {
  platform: 'DISCORD' as Platform,

  isConfigured(): boolean {
    return isDiscordConfigured();
  },

  /** Why the Connect button is unavailable, in plain language. */
  unavailableReason(): string | null {
    return isDiscordConfigured() ? null : 'Discord sign-in has not been set up by the administrator yet.';
  },

  async start(ctx: AdapterStartContext): Promise<AdapterStartResult> {
    const cfg = discordConfig();
    if (!cfg.clientId || !cfg.clientSecret) {
      throw new ConnectionError('Discord sign-in is not available yet.', 503, 'DISCORD_NOT_CONFIGURED');
    }
    const { state, codeVerifier } = await ConnectionService.createState('DISCORD', cfg.redirectUri, ctx.userId);
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', cfg.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', cfg.redirectUri);
    url.searchParams.set('scope', DISCORD_SCOPES.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', pkceChallenge(codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('prompt', 'consent');
    return { kind: 'redirect', url: url.toString() };
  },
/**
   * Completes the flow. The token is only accepted AFTER Discord confirms it by
   * returning the authorized user from /users/@me with that same token.
   */
  async complete(ctx: { code: string; state: string; codeVerifier: string }): Promise<VerifiedConnection> {
    const cfg = discordConfig();
    if (!cfg.clientId || !cfg.clientSecret) {
      throw new ConnectionError('Discord sign-in is not available yet.', 503, 'DISCORD_NOT_CONFIGURED');
    }

    const token = await postForm(TOKEN_URL, {
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'authorization_code',
      code: ctx.code,
      redirect_uri: cfg.redirectUri,
      code_verifier: ctx.codeVerifier,
    });

    if (!token?.access_token) {
      throw new ConnectionError('Discord did not return an access token.', 400, 'DISCORD_NO_TOKEN');
    }

    // VERIFICATION: the token is trusted only because Discord accepted it here.
    const meRes = await fetch(ME_URL, { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (!meRes.ok) {
      throw new ConnectionError('Discord could not verify this authorization. Please reconnect.', 400, 'DISCORD_VERIFY_FAILED');
    }
    const me = (await meRes.json()) as { id?: string; username?: string; global_name?: string; email?: string };
    if (!me?.id) {
      throw new ConnectionError('Discord did not identify the account.', 400, 'DISCORD_NO_IDENTITY');
    }

    const scopes: string[] = typeof token.scope === 'string' && token.scope ? token.scope.split(/\s+/) : DISCORD_SCOPES;
    return {
      externalAccountId: String(me.id),
      displayName: me.global_name || me.username || null,
      username: me.username ? String(me.username) : null,
      scopes,
      accessToken: String(token.access_token),
      refreshToken: token.refresh_token ? String(token.refresh_token) : null,
      tokenExpiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null,
      metadata: { discordUserId: String(me.id), email: me.email ?? '' },
    };
  },

  /** Best-effort platform-side revocation on disconnect. */
  async revoke(userId: string): Promise<void> {
    const cfg = discordConfig();
    const token = await ConnectionService.readAccessToken(userId, 'DISCORD');
    if (!token || !cfg.clientId) return;
    await postForm(REVOKE_URL, { client_id: cfg.clientId, token }).catch(() => undefined);
  },

  /** Re-checks a stored connection against Discord so status is never stale. */
  async verify(userId: string): Promise<{ ok: boolean; detail: string }> {
    const token = await ConnectionService.readAccessToken(userId, 'DISCORD');
    if (!token) return { ok: false, detail: 'No Discord credential is stored.' };
    const res = await fetch(ME_URL, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { ok: false, detail: 'Discord rejected the stored credential. Please reconnect.' };
    return { ok: true, detail: 'Discord confirmed this account is authorized.' };
  },
};

export default adapter;