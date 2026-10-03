/**
 * SERVER-ONLY SECRET STORAGE
 * ============================================================================
 * Platform connection tokens (Discord OAuth access/refresh tokens, Meta user and
 * system-user tokens) are NEVER persisted in plaintext and NEVER returned by
 * any API. They are stored as AES-256-GCM ciphertext and can only be decrypted
 * on the server, using a key derived from DWS_TOKEN_ENCRYPTION_KEY.
 *
 * DESIGN RULES enforced here:
 *  1. Authenticated encryption. GCM's tag detects tampering on decrypt.
 *  2. Per-value random salt + IV. Never reuse an IV under the same key.
 *  3. AAD binds every ciphertext to `<userId>:<platform>`, so a token copied
 *     from one row into another user's row FAILS to decrypt instead of
 *     authenticating. This is the server-side half of cross-user isolation.
 *  4. No plaintext ever reaches a log line, an API response, or an error.
 *
 * If DWS_TOKEN_ENCRYPTION_KEY is missing, the store refuses to persist anything.
 * Connections are then honestly reported as unconfigured rather than silently
 * storing a real token under a weak, guessable key.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const SALT_BYTES = 16;
const MIN_KEY_LENGTH = 32;

export function readEncryptionSecret(env: NodeJS.ProcessEnv = process.env): string {
  return (env.DWS_TOKEN_ENCRYPTION_KEY ?? '').trim();
}

/** True when a real, operator-provided key of sufficient length exists. */
export function isTokenEncryptionConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return readEncryptionSecret(env).length >= MIN_KEY_LENGTH;
}

function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, 32);
}

/**
 * Encrypts a platform token.
 * @param aad `${userId}:${platform}` — cryptographically binds token to its owner.
 */
export function encryptSecret(plaintext: string, aad: string, env: NodeJS.ProcessEnv = process.env): string {
  const secret = readEncryptionSecret(env);
  if (secret.length < MIN_KEY_LENGTH) {
    throw new Error('Token encryption is not configured (DWS_TOKEN_ENCRYPTION_KEY must be at least 32 characters).');
  }
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, deriveKey(secret, salt), iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // v1.salt.iv.tag.ciphertext — one opaque, storable string.
  return ['v1', salt.toString('base64url'), iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

/** Decrypts a token produced by encryptSecret. Returns null on ANY failure. */
export function decryptSecret(payload: string, aad: string, env: NodeJS.ProcessEnv = process.env): string | null {
  try {
    const secret = readEncryptionSecret(env);
    if (secret.length < MIN_KEY_LENGTH) return null;
    const [version, saltB64, ivB64, tagB64, dataB64] = payload.split('.');
    if (version !== 'v1' || !saltB64 || !ivB64 || !tagB64 || !dataB64) return null;
    const decipher = createDecipheriv(ALGO, deriveKey(secret, Buffer.from(saltB64, 'base64url')), Buffer.from(ivB64, 'base64url'));
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    // Wrong key, tampered ciphertext or AAD mismatch are deliberately indistinguishable.
    return null;
  }
}

/* ------------------------------------------------------------------ passwords */

/**
 * Hashes an application-login password with scrypt.
 * Format: scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>. Parameters are stored inline so
 * they can be raised later without invalidating existing users.
 */
export function hashPassword(password: string): string {
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const derived = scryptSync(password.normalize('NFKC'), salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return ['scrypt', N, r, p, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

/** Constant-time password check. Never throws on malformed input. */
export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4], 'base64url');
    const expected = Buffer.from(parts[5], 'base64url');
    const actual = scryptSync(password.normalize('NFKC'), salt, expected.length, { N, r, p, maxmem: 64 * 1024 * 1024 });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------- helpers */

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** URL-safe random value for OAuth `state` and PKCE verifiers. */
export function randomUrlSafe(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Constant-time string compare — used for verifying Telegram's HMAC `hash`. */
export function safeEqualStrings(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}