/**
 * APPLICATION AUTHENTICATION
 * ============================================================================
 * Answers one question only: "Who is using D Web Studio Lead AI?"
 *
 * This module is deliberately kept separate from:
 *   - platform connections (server/src/connections/*) — which account is linked
 *   - automation          (server/src/agent/*)         — what the AI should do
 *
 * TWO AUTH MODES
 *  1. USER ACCOUNTS (the normal product experience)
 *     email + password -> scrypt hash in the User table -> a random session
 *     token in an HttpOnly cookie. The database stores only sha256(token).
 *  2. OPERATOR PASSWORD (backwards-compatible bootstrap / break-glass)
 *     The pre-existing single shared DWS_ADMIN_PASSWORD + HMAC cookie, kept so
 *     an existing deployment is not locked out by this change. It grants OWNER
 *     access, so it is treated as an administrative credential.
 *
 * Both modes satisfy requireAuth, which every private route uses.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import {
  AuthError,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  UserService,
  clearLoginFailures,
  isLoginRateLimited,
  recordLoginFailure,
  type PublicUser,
} from './userService.js';

const OPERATOR_COOKIE_NAME = 'dws_session';

interface SessionPayload {
  exp: number;
  nonce: string;
}

interface LoginAttempt {
  count: number;
  resetAt: number;
}

const loginAttempts = new Map<string, LoginAttempt>();

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}

export interface OperatorAuthConfig {
  required: boolean;
  configured: boolean;
  password: string;
  sessionSecret: string;
}

export function readOperatorAuthConfig(env: NodeJS.ProcessEnv = process.env): OperatorAuthConfig {
  const password = (env.DWS_ADMIN_PASSWORD ?? '').trim();
  const sessionSecret = (env.DWS_SESSION_SECRET ?? '').trim();
  const production = env.NODE_ENV === 'production';
  const configured = Boolean(password && sessionSecret);
  return { required: production || configured, configured, password, sessionSecret };
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function createSessionToken(config: OperatorAuthConfig): string {
  const payload: SessionPayload = {
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    nonce: randomBytes(12).toString('hex'),
  };
  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, config.sessionSecret)}`;
}

function readCookie(req: { headers: { cookie?: string } }, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function isValidSession(token: string | null, config: OperatorAuthConfig): boolean {
  if (!token || !config.configured) return false;
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return false;
  if (!safeEqual(signature, sign(encodedPayload, config.sessionSecret))) return false;
  try {
    const payload = JSON.parse(decode(encodedPayload)) as SessionPayload;
    return Number.isFinite(payload.exp) && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function operatorCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
}

function appCookieOptions() {
  return {
    httpOnly: true,
    // 'lax' (not 'strict') so returning from Discord/Telegram/Meta OAuth works:
    // those are top-level GET navigations that must carry our cookie.
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
}

function clientKey(req: { ip?: string; socket?: { remoteAddress?: string } }): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/* --------------------------------------------------------- authentication */

/**
 * Resolves the caller from either credential and populates req.user.
 * Returns null when the request is anonymous.
 *
 * Local development with NO credentials configured is intentionally allowed
 * through (this preserves the existing frictionless `npm run dev` experience)
 * and is attributed to the OWNER role. Production always requires a real login.
 */
export async function resolveRequestUser(req: Request): Promise<PublicUser | null> {
  const config = readOperatorAuthConfig();
  const appToken = readCookie(req, SESSION_COOKIE_NAME);
  if (appToken) {
    const user = await UserService.resolveSession(appToken);
    if (user) return user;
  }
  const operatorToken = readCookie(req, OPERATOR_COOKIE_NAME);
  if (isValidSession(operatorToken, config)) {
    // The shared operator password is an administrative credential.
    return { id: 'operator', email: 'operator@dwebstudio.local', name: 'Operator', role: 'OWNER', createdAt: new Date().toISOString() };
  }
  if (!config.required) {
    return { id: 'local-dev', email: 'local@dwebstudio.local', name: 'Local', role: 'OWNER', createdAt: new Date().toISOString() };
  }
  return null;
}

/**
 * Gate for every private API route. Webhooks and health are mounted outside it.
 * Populates req.user so downstream handlers can scope queries by owner.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  resolveRequestUser(req)
    .then((user) => {
      if (!user) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      req.user = user;
      next();
    })
    .catch((err) => {
      res.status(500).json({ error: 'Authentication check failed.' });
    });
};

/** Admin-only gate for the operator credential vault. */
export const requireOwner: RequestHandler = (req, res, next) => {
  if (req.user?.role !== 'OWNER') {
    res.status(403).json({ error: 'Administrator access required.' });
    return;
  }
  next();
};

/** Backwards-compatible alias: the old gate name now resolves a real user. */
export const requireOperatorAuth: RequestHandler = requireAuth;

export const authRouter = Router();

/**
 * GET /api/auth/session
 * Tells the frontend which screen to render. Never returns a token or a hash.
 */
authRouter.get('/session', async (req, res) => {
  const config = readOperatorAuthConfig();
  const user = await resolveRequestUser(req).catch(() => null);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    authenticated: Boolean(user),
    user: user ?? null,
    required: config.required,
    configured: config.configured,
    // Lets the UI show "Create account" only when nobody has registered yet.
    registrationOpen: config.required,
    hasUsers: await UserService.count().then((n) => n > 0).catch(() => true),
  });
});

/**
 * POST /api/auth/register — "Create account".
 * The first account becomes OWNER so an administrator always exists.
 */
authRouter.post('/register', async (req: Request, res: Response) => {
  const key = clientKey(req);
  if (isLoginRateLimited(key)) {
    res.status(429).json({ error: 'Too many attempts. Try again later.' });
    return;
  }
  try {
    const user = await UserService.register({
      email: req.body?.email,
      password: req.body?.password,
      name: req.body?.name,
    });
    const token = await UserService.createSession(user.id, {
      userAgent: req.get('user-agent'),
      ipAddress: req.ip,
    });
    clearLoginFailures(key);
    res.cookie(SESSION_COOKIE_NAME, token, appCookieOptions());
    res.status(201).json({ success: true, user });
  } catch (err) {
    recordLoginFailure(key);
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Could not create the account.' });
  }
});

/** POST /api/auth/login — the normal user flow. */
authRouter.post('/login', async (req: Request, res: Response) => {
  const config = readOperatorAuthConfig();
  const key = clientKey(req);
  if (isLoginRateLimited(key)) {
    res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    return;
  }
  try {
    const user = await UserService.authenticate({ email: req.body?.email, password: req.body?.password });
    const token = await UserService.createSession(user.id, { userAgent: req.get('user-agent'), ipAddress: req.ip });
    clearLoginFailures(key);
    res.cookie(SESSION_COOKIE_NAME, token, appCookieOptions());
    res.json({ success: true, user });
  } catch (err) {
    recordLoginFailure(key);
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Login failed.' });
  }
});

/** POST /api/auth/logout — revokes the session server-side. */
authRouter.post('/logout', async (req: Request, res: Response) => {
  await UserService.destroySession(readCookie(req, SESSION_COOKIE_NAME));
  res.clearCookie(SESSION_COOKIE_NAME, { ...appCookieOptions(), maxAge: 0 });
  res.json({ success: true });
});

/**
 * POST /api/auth/operator — backwards-compatible shared operator password.
 * Kept as an administrative break-glass path, NOT the normal user experience.
 */
authRouter.post('/operator', (req, res) => {
  const config = readOperatorAuthConfig();
  if (!config.required) return res.json({ success: true, required: false });
  if (!config.configured) {
    return res.status(503).json({ error: 'Operator authentication is not configured.' });
  }
  const key = clientKey(req);
  if (isLoginRateLimited(key)) {
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }
  const supplied = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!supplied || !safeEqual(supplied, config.password)) {
    recordLoginFailure(key);
    return res.status(401).json({ error: 'Invalid operator credentials.' });
  }
  clearLoginFailures(key);
  res.cookie(OPERATOR_COOKIE_NAME, createSessionToken(config), operatorCookieOptions());
  return res.json({ success: true, required: true });
});
