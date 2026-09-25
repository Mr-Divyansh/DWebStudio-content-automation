/**
 * Operator authentication for the private dashboard/API.
 *
 * Production uses a password exchanged for a short-lived, signed, HttpOnly
 * session cookie. Local development remains frictionless when no operator
 * credentials are configured. Secrets are read only from the environment and
 * are never returned or logged.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { Router, type RequestHandler } from 'express';

const COOKIE_NAME = 'dws_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_LOGIN_ATTEMPTS = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

interface SessionPayload {
  exp: number;
  nonce: string;
}

interface LoginAttempt {
  count: number;
  resetAt: number;
}

const loginAttempts = new Map<string, LoginAttempt>();

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
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
}

/** Protects every private API route; webhook and health routes are mounted outside it. */
export const requireOperatorAuth: RequestHandler = (req, res, next) => {
  const config = readOperatorAuthConfig();
  if (!config.required) return next();
  if (!config.configured) {
    return res.status(503).json({ error: 'Operator authentication is not configured.' });
  }
  if (!isValidSession(readCookie(req, COOKIE_NAME), config)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(401).json({ error: 'Authentication required.' });
  }
  return next();
};

function clientKey(req: { ip?: string; socket?: { remoteAddress?: string } }): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 0, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  return current.count >= MAX_LOGIN_ATTEMPTS;
}

function recordFailedLogin(key: string): void {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    current.count += 1;
  }
}

export const authRouter = Router();

authRouter.get('/session', (req, res) => {
  const config = readOperatorAuthConfig();
  res.json({
    authenticated: config.required ? isValidSession(readCookie(req, COOKIE_NAME), config) : true,
    required: config.required,
    configured: config.configured,
  });
});

authRouter.post('/login', (req, res) => {
  const config = readOperatorAuthConfig();
  if (!config.required) return res.json({ success: true, required: false });
  if (!config.configured) {
    return res.status(503).json({ error: 'Operator authentication is not configured.' });
  }

  const key = clientKey(req);
  if (isRateLimited(key)) {
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }

  const supplied = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!supplied || !safeEqual(supplied, config.password)) {
    recordFailedLogin(key);
    return res.status(401).json({ error: 'Invalid operator credentials.' });
  }

  loginAttempts.delete(key);
  res.cookie(COOKIE_NAME, createSessionToken(config), cookieOptions());
  return res.json({ success: true, required: true });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: 0 });
  res.json({ success: true });
});
