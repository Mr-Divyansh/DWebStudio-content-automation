/**
 * PLATFORM CONNECTION LAYER — shared types
 * ============================================================================
 * Three strictly separated concerns, deliberately kept in separate modules:
 *
 *   1. APPLICATION LOGIN  -> server/src/api/auth.ts + userService.ts
 *                           "Who is using D Web Studio Lead AI?"
 *   2. PLATFORM CONNECTION-> server/src/connections/*   (this file's layer)
 *                           "Which WhatsApp/Discord/Telegram account is linked?"
 *   3. AUTOMATION        -> server/src/agent/*          (UNCHANGED)
 *                           "What should the Lead AI do with that account?"
 *
 * Nothing in this layer contains automation logic, and nothing here knows about
 * leads. That is the architecture rule the product direction demands.
 *
 * HARD RULE: a connection is only ever marked CONNECTED after the PLATFORM has
 * verified the credential (Discord /users/@me, Telegram HMAC, Meta Graph API,
 * Google userinfo + Gmail profile). There is intentionally no code path that sets
 * CONNECTED from user input, so the UI can never show a fake "connected" state.
 */

export const PLATFORMS = ['INSTAGRAM', 'WHATSAPP', 'GMAIL', 'DISCORD', 'TELEGRAM'] as const;
export type Platform = (typeof PLATFORMS)[number];

export type ConnectionStatus = 'NOT_CONNECTED' | 'PENDING' | 'CONNECTED' | 'ERROR' | 'REVOKED';

/** Safe, token-free shape returned to the browser. */
export interface ConnectionSummary {
  platform: Platform;
  label: string;
  status: ConnectionStatus;
  connected: boolean;
  displayName: string | null;
  username: string | null;
  /**
   * Verified account email when the provider exposes one (Gmail, Discord).
   * Derived from the non-secret `metadata` column, so this needs no extra
   * database column and can never carry a credential.
   */
  accountEmail: string | null;
  scopes: string[];
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  /**
   * Why "Connect" is unavailable (e.g. the developer has not finished the
   * one-time platform setup). Plain-language, never a technical key dump.
   */
  connectHint: string | null;
}

export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value);
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  INSTAGRAM: 'Instagram',
  WHATSAPP: 'WhatsApp',
  GMAIL: 'Gmail',
  DISCORD: 'Discord',
  TELEGRAM: 'Telegram',
};

/**
 * Order the Connected Accounts screen renders. Instagram first (it is the
 * primary lead channel), then messaging, then the others.
 */
export const PLATFORM_ORDER: Record<Platform, number> = {
  INSTAGRAM: 0,
  WHATSAPP: 1,
  GMAIL: 2,
  DISCORD: 3,
  TELEGRAM: 4,
};

/** Parses the JSON-encoded scopes/metadata columns defensively. */
export function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
}

export function parseJsonObject(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]))
      : {};
  } catch {
    return {};
  }
}

/** What an adapter returns after a successful, platform-verified connection. */
export interface VerifiedConnection {
  externalAccountId: string;
  displayName: string | null;
  username: string | null;
  scopes: string[];
  /** Plaintext tokens. Written straight to encrypted storage; never logged. */
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  /** Non-secret values the automation layer needs (ids, not secrets). */
  metadata: Record<string, string>;
}

export class ConnectionError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    /** Machine-readable reason the UI can map to friendly copy. */
    readonly reason: string = 'CONNECTION_FAILED',
  ) {
    super(message);
    this.name = 'ConnectionError';
  }
}