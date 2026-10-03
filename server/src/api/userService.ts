/**
 * APPLICATION LOGIN SERVICE
 * ============================================================================
 * Answers exactly one question: "Who is using D Web Studio Lead AI?"
 *
 * This is deliberately SEPARATE from:
 *   - platform connections  (server/src/connections/*) — "which account is linked?"
 *   - automation rules      (server/src/agent/*)         — "what should the AI do?"
 *
 * SECURITY MODEL
 *  - Passwords are hashed with scrypt + a per-user salt (secretStore.hashPassword).
 *    The plaintext is never logged, never stored, and never returned.
 *  - A session cookie carries a 256-bit random token. Only sha256(token) is
 *    persisted, so read access to the database does NOT yield a usable cookie.
 *  - Sessions are revocable server-side and expire; logging out revokes the row.
 *  - Login attempts are rate limited per IP to slow credential stuffing.
 *  - The first account created becomes OWNER; OWNER is the only role that may
 *    read the operator credential vault. Everyone else is a MEMBER.
 */

import { prisma } from '../database/client.js';
import { hashPassword, verifyPassword, sha256Hex, randomUrlSafe } from './secretStore.js';

export const SESSION_COOKIE_NAME = 'dws_app_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const MIN_PASSWORD_LENGTH = 10;

export type PublicUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
};

export function toPublicUser(user: {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

export function normalizeEmail(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : '';
}

export class UserService {
  static async count(): Promise<number> {
    return prisma.user.count();
  }

  /**
   * Creates an account. The FIRST account becomes OWNER (the admin/developer
   * persona); everyone after that is a MEMBER. Email must be unique.
   */
  static async register(input: { email: unknown; password: unknown; name?: unknown }): Promise<PublicUser> {
    const email = normalizeEmail(input.email);
    if (!email) throw new AuthError('Enter a valid email address.', 400);

    const password = typeof input.password === 'string' ? input.password : '';
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new AuthError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, 400);
    }
    if (password.length > 200) throw new AuthError('Password is too long.', 400);

    const existing = await prisma.user.findUnique({ where: { email } });
    // Deliberately vague: do not reveal whether an address is already registered.
    if (existing) throw new AuthError('Unable to create an account with those details.', 409);

    const isFirstUser = (await prisma.user.count()) === 0;
    const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 120) : null;

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: hashPassword(password),
        role: isFirstUser ? 'OWNER' : 'MEMBER',
      },
    });
    return toPublicUser(user);
  }

  /**
   * Verifies credentials. Throws the SAME error for "unknown email" and "wrong
   * password" so the endpoint cannot be used to enumerate registered accounts.
   */
  static async authenticate(input: { email: unknown; password: unknown }): Promise<PublicUser> {
    const email = normalizeEmail(input.email);
    const password = typeof input.password === 'string' ? input.password : '';
    const invalid = new AuthError('Incorrect email or password.', 401);
    if (!email || !password) throw invalid;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Do comparable work on the miss path so timing does not reveal existence.
      verifyPassword(password, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
      throw invalid;
    }
    if (user.status !== 'ACTIVE') throw new AuthError('This account has been disabled.', 403);
    if (!verifyPassword(password, user.passwordHash)) throw invalid;

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return toPublicUser(user);
  }

  /** Issues a session. Returns the raw token exactly once, for the cookie. */
  static async createSession(
    userId: string,
    meta: { userAgent?: string | null; ipAddress?: string | null } = {},
  ): Promise<string> {
    const token = randomUrlSafe(32);
    await prisma.authSession.create({
      data: {
        userId,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
        ipAddress: meta.ipAddress?.slice(0, 64) ?? null,
      },
    });
    return token;
  }

  /** Resolves a cookie token to a live user. Expired/revoked rows never match. */
  static async resolveSession(token: string | null | undefined): Promise<PublicUser | null> {
    if (!token) return null;
    const session = await prisma.authSession.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;
    if (session.user.status !== 'ACTIVE') return null;
    return toPublicUser(session.user);
  }

  /** Revokes a single session (logout). */
  static async destroySession(token: string | null | undefined): Promise<void> {
    if (!token) return;
    await prisma.authSession
      .updateMany({ where: { tokenHash: sha256Hex(token) }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }

  /** Revokes every session for a user — used when the password is changed. */
  static async destroyAllSessions(userId: string): Promise<void> {
    await prisma.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  static async getById(id: string): Promise<PublicUser | null> {
    const user = await prisma.user.findUnique({ where: { id } });
    return user ? toPublicUser(user) : null;
  }

  /** Housekeeping: delete sessions that expired more than a day ago. */
  static async pruneExpiredSessions(): Promise<number> {
    const result = await prisma.authSession.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    return result.count;
  }
}

/* ----------------------------------------------------------- login throttling */

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

export function isLoginRateLimited(key: string): boolean {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 0, resetAt: now + WINDOW_MS });
    return false;
  }
  return current.count >= MAX_ATTEMPTS;
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else current.count += 1;
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}