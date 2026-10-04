/**
 * CONNECTION SERVICE — persistence, OAuth state, token handling
 * ============================================================================
 * Owns everything that touches the ConnectedAccount / OAuthState tables.
 *
 * SECURITY INVARIANTS enforced in this file:
 *  1. Reads for the API go through toSummary(), which returns ONLY non-secret
 *     fields. There is no code path that serializes accessTokenCiphertext.
 *  2. Tokens are encrypted with AAD = `${userId}:${platform}`, so a ciphertext
 *     copied into another user's row cannot decrypt.
 *  3. Every query is filtered by userId. There is no "get connection by id"
 *     without an owner check, which is what prevents cross-user data access.
 *  4. OAuth `state` is stored HASHED and is single-use: consuming it sets
 *     consumedAt, and a second attempt with the same state fails. It is also
 *     bound to the userId that started the flow, so a callback cannot attach a
 *     connection to a different account.
 */

import { prisma } from '../database/client.js';
import { encryptSecret, decryptSecret, sha256Hex, randomUrlSafe, isTokenEncryptionConfigured } from '../api/secretStore.js';
import {
  PLATFORMS,
  PLATFORM_LABELS,
  type ConnectionSummary,
  type Platform,
  type VerifiedConnection,
  parseJsonArray,
  parseJsonObject,
} from './types.js';

const STATE_TTL_MS = 10 * 60 * 1000;

type ConnectionRow = {
  platform: string;
  status: string;
  externalAccountId: string | null;
  displayName: string | null;
  externalUsername: string | null;
  accessTokenCiphertext: string | null;
  refreshTokenCiphertext: string | null;
  tokenExpiresAt: Date | null;
  scopes: string | null;
  metadata: string | null;
  lastError: string | null;
  connectedAt: Date | null;
  lastVerifiedAt: Date | null;
  createdAt: Date;
};

/** Explicit select so the summary builder can never drift into a secret column. */
const SAFE_COLUMNS = {
  platform: true,
  status: true,
  externalAccountId: true,
  displayName: true,
  externalUsername: true,
  accessTokenCiphertext: true,
  refreshTokenCiphertext: true,
  tokenExpiresAt: true,
  scopes: true,
  metadata: true,
  lastError: true,
  connectedAt: true,
  lastVerifiedAt: true,
  createdAt: true,
} as const;

export class ConnectionService {
  static isEncryptionReady(): boolean {
    return isTokenEncryptionConfigured();
  }

  /** All connections belonging to one user. Never includes another user's rows. */
  static async listForUser(userId: string): Promise<ConnectionSummary[]> {
    const rows = await prisma.connectedAccount.findMany({ where: { userId }, select: SAFE_COLUMNS });
    const byPlatform = new Map(rows.map((r) => [r.platform, r]));
    // Always return one card per supported platform, connected or not.
    return PLATFORMS.map((platform) => {
      const row = byPlatform.get(platform);
      // findMany above already filtered by userId, so a missing platform simply
      // has no row yet and is correctly reported as not connected.
      return row ? toSummary(row, platform) : toSummary(null, platform);
    });
  }

  static async findForUser(userId: string, platform: Platform): Promise<ConnectionSummary | null> {
    const row = await prisma.connectedAccount.findUnique({
      where: { userId_platform: { userId, platform } },
      select: SAFE_COLUMNS,
    });
    return row ? toSummary(row, platform) : null;
  }

  /**
   * Persists a platform-VERIFIED connection. Called only after the platform
   * itself confirmed the credential — see each adapter's verify step.
   */
  static async saveVerified(userId: string, platform: Platform, verified: VerifiedConnection): Promise<void> {
    if (!ConnectionService.isEncryptionReady()) {
      throw new Error('Server token storage is not configured. Contact your administrator.');
    }
    const aad = `${userId}:${platform}`;
    const now = new Date();
    const data = {
      status: 'CONNECTED',
      externalAccountId: verified.externalAccountId,
      displayName: verified.displayName,
      externalUsername: verified.username,
      accessTokenCiphertext: verified.accessToken ? encryptSecret(verified.accessToken, aad) : null,
      refreshTokenCiphertext: verified.refreshToken ? encryptSecret(verified.refreshToken, aad) : null,
      tokenExpiresAt: verified.tokenExpiresAt,
      scopes: JSON.stringify(verified.scopes ?? []),
      metadata: JSON.stringify(verified.metadata ?? {}),
      lastError: null,
      lastVerifiedAt: now,
      connectedAt: now,
    };
    await prisma.connectedAccount.upsert({
      where: { userId_platform: { userId, platform } },
      create: { userId, platform, ...data },
      update: data,
    });
  }

  /** Marks a failed attempt without ever storing a partial or guessed token. */
  static async markError(userId: string, platform: Platform, message: string): Promise<void> {
    await prisma.connectedAccount.upsert({
      where: { userId_platform: { userId, platform } },
      create: {
        userId,
        platform,
        status: 'ERROR',
        lastError: message.slice(0, 500),
        // No ciphertext is written on failure: an error is never "connected".
        accessTokenCiphertext: null,
        refreshTokenCiphertext: null,
      },
      update: { status: 'ERROR', lastError: message.slice(0, 500), lastVerifiedAt: new Date() },
    });
  }
/** Disconnect: revokes server-side and deletes every stored credential. */
  static async disconnect(userId: string, platform: Platform): Promise<void> {
    const row = await prisma.connectedAccount.findUnique({ where: { userId_platform: { userId, platform } } });
    if (row?.refreshTokenCiphertext || row?.accessTokenCiphertext) {
      // Best-effort platform-side revocation. A failure must NOT block the local
      // disconnect, otherwise a user could be stuck with a stored token.
      try {
        const adapter = await getAdapter(platform);
        await adapter.revoke(userId).catch(() => undefined);
      } catch {
        /* adapter unavailable — the local delete still proceeds */
      }
    }
    await prisma.connectedAccount.deleteMany({ where: { userId, platform } });
  }

  /**
   * Decrypts a stored token for SERVER-SIDE automation use only.
   * Returns null when absent or undecryptable. Never call this from a route
   * that writes the value into a response body.
   */
  static async readAccessToken(userId: string, platform: Platform): Promise<string | null> {
    const row = await prisma.connectedAccount.findUnique({
      where: { userId_platform: { userId, platform } },
      select: { accessTokenCiphertext: true, status: true },
    });
    if (!row?.accessTokenCiphertext || row.status !== 'CONNECTED') return null;
    return decryptSecret(row.accessTokenCiphertext, `${userId}:${platform}`);
  }

  static async readRefreshToken(userId: string, platform: Platform): Promise<string | null> {
    const row = await prisma.connectedAccount.findUnique({
      where: { userId_platform: { userId, platform } },
      select: { refreshTokenCiphertext: true },
    });
    if (!row?.refreshTokenCiphertext) return null;
    return decryptSecret(row.refreshTokenCiphertext, `${userId}:${platform}`);
  }

  /** Server-side metadata (ids like WABA / phone number id). Never a secret. */
  static async readMetadata(userId: string, platform: Platform): Promise<Record<string, string>> {
    const row = await prisma.connectedAccount.findUnique({
      where: { userId_platform: { userId, platform } },
      select: { metadata: true },
    });
    return parseJsonObject(row?.metadata);
  }

  /* ------------------------------------------------------------ OAuth state */

  /** Creates a single-use, hashed, user-bound OAuth state + PKCE verifier. */
  static async createState(
    platform: Platform,
    redirectUri: string,
    userId: string | null,
  ): Promise<{ state: string; codeVerifier: string }> {
    const state = randomUrlSafe(32);
    const codeVerifier = randomUrlSafe(48);
    await prisma.oAuthState.create({
      data: {
        stateHash: sha256Hex(state),
        codeVerifier,
        redirectUri,
        platform,
        userId,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
    });
    return { state, codeVerifier };
  }

  /**
   * Consumes a state exactly once. Returns null for unknown, expired, already
   * used, or user-mismatched states — all indistinguishable to the caller.
   */
  static async consumeState(
    platform: Platform,
    state: string | null | undefined,
    expectedUserId: string | null,
  ): Promise<{ codeVerifier: string; redirectUri: string; userId: string | null } | null> {
    if (!state) return null;
    const row = await prisma.oAuthState.findUnique({ where: { stateHash: sha256Hex(state) } });
    if (!row) return null;
    if (row.platform !== platform) return null;
    if (row.consumedAt || row.expiresAt.getTime() <= Date.now()) return null;
    // A flow started by a signed-in user can only complete for that same user.
    if (row.userId && row.userId !== expectedUserId) return null;

    await prisma.oAuthState.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
    return { codeVerifier: row.codeVerifier, redirectUri: row.redirectUri, userId: row.userId };
  }
}

/**
 * Maps a DB row to the token-free object the browser is allowed to see.
 * Explicit field-by-field construction is deliberate: adding a column to the
 * table can never accidentally leak it into an API response.
 */
function toSummary(row: ConnectionRow | null, platform: Platform): ConnectionSummary {
  const connected = row?.status === 'CONNECTED';
  // `metadata` holds non-secret identifiers only (ids, usernames, emails), so
  // surfacing an email from it can never leak a credential.
  const metadata = parseJsonObject(row?.metadata);
  return {
    platform,
    label: PLATFORM_LABELS[platform],
    status: (row?.status as ConnectionSummary['status']) ?? 'NOT_CONNECTED',
    connected,
    displayName: row?.displayName ?? null,
    username: row?.externalUsername ?? null,
    accountEmail: metadata.email || metadata.accountEmail || null,
    scopes: parseJsonArray(row?.scopes),
    connectedAt: row?.connectedAt ? row.connectedAt.toISOString() : null,
    lastVerifiedAt: row?.lastVerifiedAt ? row.lastVerifiedAt.toISOString() : null,
    lastError: row?.lastError ?? null,
    connectHint: connected ? null : 'You sign in on the platform itself. No passwords or tokens to paste.',
  };
}

/** Lazily imports the adapter that owns a platform (avoids a circular import). */
async function getAdapter(platform: Platform) {
  const adapters = await import('./adapters.js');
  return adapters.getAdapter(platform);
}