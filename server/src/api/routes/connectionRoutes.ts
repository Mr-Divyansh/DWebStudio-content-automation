/**
 * CONNECTED ACCOUNTS API
 * ============================================================================
 * Mounted at /api/connections and protected by requireAuth, so every handler
 * here knows exactly which user is calling (req.user).
 *
 * INVARIANTS
 *  - `req.params.platform` is validated against an allow-list; there is no
 *    dynamic require() on user input, so this cannot be used for module
 *    injection.
 *  - Every database call is scoped to user.id, which is what prevents
 *    cross-user data access.
 *  - No handler returns a token, an authorization code, or any ciphertext.
 *    Responses are built from ConnectionSummary (see connectionService.ts).
 *
 * The Discord callback is public (the browser arrives from discord.com) but is
 * protected by a single-use, hashed, user-bound `state` value — the standard
 * OAuth CS defence.
 */

import { Router, type Request, type Response } from 'express';
import { getAdapter } from '../../connections/adapters.js';
import { ConnectionService } from '../../connections/connectionService.js';
import { ConnectionError, isPlatform, PLATFORM_LABELS, type Platform, type ConnectionSummary } from '../../connections/types.js';
import type { PublicUser } from '../userService.js';

export const connectionRouter = Router();

/**
 * requireAuth guarantees req.user on every protected route, but TypeScript
 * cannot know that across the router boundary. This helper narrows it once
 * instead of scattering non-null assertions across every handler — and it fails
 * closed (403) rather than throwing if the invariant is ever broken.
 */
function currentUser(req: Request, res: Response): PublicUser | null {
  if (!req.user) {
    res.status(403).json({ error: 'Authentication required.' });
    return null;
  }
  return req.user;
}

/** Narrow helper: every platform route validates before doing any work. */
function readPlatform(req: Request, res: Response): Platform | null {
  const value = req.params.platform;
  if (!isPlatform(value)) {
    res.status(404).json({ error: 'Unknown platform.' });
    return null;
  }
  return value;
}

function toErrorResponse(err: unknown, res: Response): void {
  if (err instanceof ConnectionError) {
    res.status(err.status).json({ error: err.message, reason: err.reason });
    return;
  }
  const message = err instanceof Error ? err.message : 'Connection failed.';
  // Never surface a stack trace or an upstream response body to the browser.
  res.status(500).json({ error: message, reason: 'CONNECTION_FAILED' });
}

/**
 * GET /api/connections
 * One card per supported platform for the CURRENT user. Token-free by design.
 */
connectionRouter.get('/', async (req: Request, res: Response) => {
  const user = currentUser(req, res);
  if (!user) return;
  try {
    const summaries: ConnectionSummary[] = await ConnectionService.listForUser(user.id);
    // Attach "why is Connect disabled" without exposing any configuration value.
    const enriched = summaries.map((s) => ({
      ...s,
      available: getAdapter(s.platform).isConfigured(),
      unavailableReason: getAdapter(s.platform).unavailableReason(),
    }));
    res.json({
      accounts: enriched,
      storageReady: ConnectionService.isEncryptionReady(),
      notice: ConnectionService.isEncryptionReady()
        ? null
        : 'Secure token storage is not configured on this server. Please contact your administrator.',
    });
  } catch (err) {
    toErrorResponse(err, res);
  }
});

/**
 * POST /api/connections/:platform/connect
 * Begins the flow. Returns a redirect target (Discord) or the public SDK
 * parameters needed to render an on-page widget (WhatsApp, Telegram).
 */
connectionRouter.post('/:platform/connect', async (req: Request, res: Response) => {
  const platform = readPlatform(req, res);
  if (!platform) return;
  const user = currentUser(req, res);
  if (!user) return;
  try {
    const result = await getAdapter(platform).start({ userId: user.id });
    if (result.kind === 'redirect') {
      res.json({ platform, action: 'redirect', url: result.url });
      return;
    }
    // For widget-style flows a single-use state still binds the response to this
    // session, so a captured widget payload cannot be replayed elsewhere.
    if (platform === 'TELEGRAM') {
      const { state } = await ConnectionService.createState('TELEGRAM', '', user.id);
      res.json({ platform, action: 'widget', payload: { ...result.payload, state } });
      return;
    }
    res.json({ platform, action: 'embedded_signup', payload: result.payload });
  } catch (err) {
    await ConnectionService.markError(user.id, platform, err instanceof Error ? err.message : 'Connection failed.').catch(
      () => undefined,
    );
    toErrorResponse(err, res);
  }
});

/**
 * POST /api/connections/:platform/complete
 * Exchanges the platform's authorization payload for verified credentials.
 * This is the ONLY path in the codebase that can write status CONNECTED.
 */
connectionRouter.post('/:platform/complete', async (req: Request, res: Response) => {
  const platform = readPlatform(req, res);
  if (!platform) return;
  const user = currentUser(req, res);
  if (!user) return;
  try {
    const verified = await getAdapter(platform).complete({ ...(req.body ?? {}) });
    await ConnectionService.saveVerified(user.id, platform, verified);
    res.json({ platform, connected: true, account: await ConnectionService.findForUser(user.id, platform) });
  } catch (err) {
    await ConnectionService.markError(user.id, platform, err instanceof Error ? err.message : 'Connection failed.').catch(
      () => undefined,
    );
    toErrorResponse(err, res);
  }
});

/** POST /api/connections/:platform/disconnect */
connectionRouter.post('/:platform/disconnect', async (req: Request, res: Response) => {
  const platform = readPlatform(req, res);
  if (!platform) return;
  const user = currentUser(req, res);
  if (!user) return;
  try {
    await ConnectionService.disconnect(user.id, platform);
    res.json({ platform, connected: false, account: await ConnectionService.findForUser(user.id, platform) });
  } catch (err) {
    toErrorResponse(err, res);
  }
});

/** POST /api/connections/:platform/verify — re-checks with the platform. */
connectionRouter.post('/:platform/verify', async (req: Request, res: Response) => {
  const platform = readPlatform(req, res);
  if (!platform) return;
  const user = currentUser(req, res);
  if (!user) return;
  try {
    const result = await getAdapter(platform).verify(user.id);
    res.json({ platform, ...result });
  } catch (err) {
    toErrorResponse(err, res);
  }
});

/** Trailing guard so an unmatched path under /connections cannot fall through. */
connectionRouter.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found.' });
});

/**
 * The Discord callback is also exported as a standalone handler because it must
 * be mounted BEFORE the authentication gate: the browser arrives here as a
 * top-level navigation from discord.com and cannot present a login first. Its
 * security boundary is the single-use, user-bound OAuth `state`.
 *
 * It is defined last so every declaration above it is already initialised.
 */
export const discordCallbackHandler: (req: Request, res: Response) => Promise<void> = async (req, res) => {
  const appUrl = (process.env.APP_URL ?? '').trim().replace(/\/+$/, '');
  const finish = (ok: boolean, message: string) =>
    res.redirect(`${appUrl}/?tab=connections&connect=${ok ? 'success' : 'error'}&message=${encodeURIComponent(message)}`);

  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const state = typeof req.query.state === 'string' ? req.query.state : null;

  if (!code || !state) {
    finish(false, 'Discord did not return an authorization code.');
    return;
  }

  // The state row carries the userId that started the flow, so we never trust a
  // user-supplied identifier here.
  const consumed = await ConnectionService.consumeState('DISCORD', state, null);
  if (!consumed?.userId) {
    finish(false, 'This Discord authorization expired or was already used. Please try again.');
    return;
  }

  try {
    const verified = await getAdapter('DISCORD').complete({ code, state, codeVerifier: consumed.codeVerifier });
    await ConnectionService.saveVerified(consumed.userId, 'DISCORD', verified);
    finish(true, `${PLATFORM_LABELS.DISCORD} connected successfully.`);
  } catch (err) {
    await ConnectionService.markError(consumed.userId, 'DISCORD', err instanceof Error ? err.message : 'Connection failed.').catch(
      () => undefined,
    );
    finish(false, err instanceof Error ? err.message : 'Discord could not be connected.');
  }
};

/**
 * GET /api/connections/telegram/complete
 * Telegram's Login Widget navigates the browser to `data-auth-url` with the
 * signed payload as query parameters, so this is a top-level GET, not the POST
 * used by the generic /complete route.
 *
 * Mounted before the auth gate (like the Discord callback). Security comes from
 * the widget's HMAC signature plus the single-use, user-bound `state`: Telegram
 * proves the payload is genuine and untampered, and `state` proves this response
 * belongs to the session that opened the widget.
 */
export const telegramCallbackHandler: (req: Request, res: Response) => Promise<void> = async (req, res) => {
  const appUrl = (process.env.APP_URL ?? '').trim().replace(/\/+$/, '');
  const finish = (ok: boolean, msg: string) =>
    res.redirect(`${appUrl}/?tab=connections&connect=${ok ? 'success' : 'error'}&message=${encodeURIComponent(msg)}`);

  // Telegram sends every field as a string; only `id` and `auth_date` are numeric.
  const payload: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.query ?? {})) {
    if (typeof value === 'string') payload[key] = value;
  }

  if (!payload.hash || !payload.id || !payload.auth_date) {
    finish(false, 'Telegram did not return a valid authorization.');
    return;
  }

  // Consume state WITHOUT a userId: the browser is not yet re-authenticated at
  // this point, so the row's own userId is the authority for who to attach to.
  const consumed = await ConnectionService.consumeState('TELEGRAM', payload.state ?? null, null);
  if (!consumed?.userId) {
    finish(false, 'This Telegram authorization expired or was already used. Please try again.');
    return;
  }

  try {
    const verified = await getAdapter('TELEGRAM').complete({ ...payload, __consumedState: true });
    await ConnectionService.saveVerified(consumed.userId, 'TELEGRAM', verified);
    finish(true, 'Telegram connected successfully.');
  } catch (err) {
    await ConnectionService.markError(consumed.userId, 'TELEGRAM', err instanceof Error ? err.message : 'Connection failed.').catch(
      () => undefined,
    );
    finish(false, err instanceof Error ? err.message : 'Telegram could not be connected.');
  }
};

/**
 * GET /api/connections/discord/callback (mounted after auth inside the router,
 * so it also works when the whole router is mounted behind requireAuth).
 */
connectionRouter.get('/discord/callback', discordCallbackHandler);
/**
 * Shared shape of an OAuth redirect landing: Meta and Google both return here as
 * a top-level GET navigation, so the handler cannot rely on a JSON session call.
 */
function oauthRedirectHandler(platform: Platform, successCopy: string) {
  return async (req: Request, res: Response): Promise<void> => {
    const appUrl = (process.env.APP_URL ?? '').trim().replace(/\/+$/, '');
    const finish = (ok: boolean, message: string) =>
      res.redirect(`${appUrl}/?tab=connections&connect=${ok ? 'success' : 'error'}&message=${encodeURIComponent(message)}`);

    // The user may decline consent; surface that plainly instead of a generic error.
    if (typeof req.query.error === 'string') {
      const denied = req.query.error === 'access_denied';
      finish(false, denied ? `Authorization was cancelled. ${PLATFORM_LABELS[platform]} was not connected.` : 'The provider reported an authorization error. Please try again.');
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    if (!code || !state) {
      finish(false, `${PLATFORM_LABELS[platform]} did not return an authorization code.`);
      return;
    }

    // Single-use, hashed, user-bound state is the security boundary here.
    const consumed = await ConnectionService.consumeState(platform, state, null);
    if (!consumed?.userId) {
      finish(false, `This ${PLATFORM_LABELS[platform]} authorization expired or was already used. Please try again.`);
      return;
    }

    try {
      const verified = await getAdapter(platform).complete({ code, state, codeVerifier: consumed.codeVerifier });
      await ConnectionService.saveVerified(consumed.userId, platform, verified);
      finish(true, successCopy);
    } catch (err) {
      await ConnectionService.markError(
        consumed.userId,
        platform,
        err instanceof Error ? err.message : 'Connection failed.',
      ).catch(() => undefined);
      finish(false, err instanceof Error ? err.message : `${PLATFORM_LABELS[platform]} could not be connected.`);
    }
  };
}

/**
 * GET /api/connections/instagram/callback
 * Used by the classic Facebook OAuth dialog. When the administrator has
 * configured an Embedded Signup configuration id instead, the frontend posts the
 * code to POST /api/connections/INSTAGRAM/complete and this route is unused.
 */
export const instagramCallbackHandler = oauthRedirectHandler('INSTAGRAM', 'Instagram connected successfully.');

/**
 * GET /api/connections/gmail/callback
 * Google's standard OAuth 2.0 redirect landing.
 */
export const gmailCallbackHandler = oauthRedirectHandler('GMAIL', 'Gmail connected successfully.');

connectionRouter.get('/discord/callback', discordCallbackHandler);
connectionRouter.get('/instagram/callback', instagramCallbackHandler);
connectionRouter.get('/gmail/callback', gmailCallbackHandler);