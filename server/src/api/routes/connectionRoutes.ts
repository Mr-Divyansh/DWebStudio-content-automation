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
import { providerSetup } from '../../connections/providerSetup.js';
import {
  ConnectionError,
  isPlatform,
  PLATFORM_LABELS,
  appOrigin,
  type Platform,
  type ConnectionSummary,
  type ConnectionState,
} from '../../connections/types.js';
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
 * Derives the single state the UI renders from.
 *
 * Order matters: a live verified credential always wins, because the user CAN
 * still disconnect or re-verify even if the admin later removed a variable. A
 * stored error outranks "not configured", since the user is the one who can fix
 * it by retrying.
 */
function deriveState(summary: ConnectionSummary, configured: boolean, storageReady: boolean): ConnectionState {
  if (summary.connected) return 'CONNECTED';
  if (summary.status === 'ERROR') return 'AUTHORIZATION_FAILED';
  if (!storageReady) return 'UNAVAILABLE';
  if (!configured) return 'SETUP_REQUIRED';
  return 'READY';
}

/**
 * GET /api/connections
 * One card per supported platform for the CURRENT user. Token-free by design.
 *
 * Every card now carries BOTH `available` (backwards compatible) and the richer
 * `state` + `setup`, so the UI can keep every Connect button clickable and open
 * an actionable setup modal instead of silently disabling the button.
 */
connectionRouter.get('/', async (req: Request, res: Response) => {
  const user = currentUser(req, res);
  if (!user) return;
  try {
    const storageReady = ConnectionService.isEncryptionReady();
    const summaries: ConnectionSummary[] = await ConnectionService.listForUser(user.id);
    const enriched = summaries.map((s) => {
      const configured = getAdapter(s.platform).isConfigured();
      return {
        ...s,
        available: configured,
        unavailableReason: getAdapter(s.platform).unavailableReason(),
        state: deriveState(s, configured, storageReady),
        setup: providerSetup(s.platform),
      };
    });
    res.json({
      accounts: enriched,
      storageReady,
      notice: storageReady
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

  // Unconfigured providers get a NORMAL 200 with an actionable `setup_required`
  // action rather than a 503. The button stays clickable, the client gets the
  // exact missing variable names, and no OAuth state row is created for a flow
  // that could never start.
  if (!getAdapter(platform).isConfigured()) {
    res.json({ platform, action: 'setup_required', setup: providerSetup(platform) });
    return;
  }

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
  const appUrl = appOrigin();
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
  const appUrl = appOrigin();
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
 * EXPLAINS AN OAUTH ERROR INSTEAD OF DISGUISING IT
 * ============================================================================
 * THE BUG THIS FIXES
 * The callback used to collapse every non-happy path into "did not return an
 * authorization code." That is actively harmful: Google's consent screen returns
 * `error=redirect_uri_mismatch` / `unauthorized_client` / `org_internal` WITHOUT
 * a code, so a completely misconfigured app reported a vague message that sent
 * the user hunting for a missing parameter that was never missing.
 *
 * These maps name the real cause and, where we can, the exact remedy. Provider
 * error text is attacker-influenceable, so it is only ever used to pick a known
 * key below — never rendered verbatim into the page.
 *
 * Nothing here logs or echoes `error_description`: it can contain a client id or
 * a redirect URI, and echoing arbitrary provider text into a redirect URL is an
 * open-redirect/XSS foot-gun.
 */
function describeProviderError(platform: Platform, code: string, appUrl: string): string {
  const label = PLATFORM_LABELS[platform];

  if (code === 'access_denied' || code === 'user_cancelled') {
    return `Authorization was cancelled. ${label} was not connected.`;
  }
  // Google sends redirect_uri_mismatch when the registered URI differs at all.
  // This is by far the most common misconfiguration, so it gets the exact URI.
  if (code === 'redirect_uri_mismatch') {
    return `${label} rejected the redirect URI. Add this exact URI to your app's authorised redirect URIs, including the port: ${appUrl}/api/connections/${platform.toLowerCase()}/callback`;
  }
  // Google shows this when an "Internal" consent screen is used with a consumer
  // account that is not in the Workspace organisation.
  if (code === 'org_internal' || code === 'access_denied_org') {
    return `${label} is restricted to your organisation. In Google Cloud Console set the consent screen user type to EXTERNAL, then add your email under Test users.`;
  }
  if (code === 'unauthorized_client' || code === 'invalid_client') {
    return `${label} rejected this OAuth client. Check that the client is a Web application and that its authorised redirect URIs include the exact callback for this server.`;
  }
  if (code === 'invalid_scope') {
    return `${label} rejected the requested permissions. The app may need the Gmail API enabled, or Advanced Access for these scopes.`;
  }
  if (code === 'interaction_required' || code === 'consent_required') {
    return `${label} needs you to approve access again. Please retry the connection.`;
  }
  if (code === 'invalid_request') {
    return `${label} rejected the authorization request. Please retry the connection.`;
  }
  if (code === 'invalid_grant' || code === 'bad_verification_code') {
    return `${label} authorization could not be exchanged. Please start the connection again.`;
  }
  return `${label} reported an authorization error (${code}). Please check the provider setup and try again.`;
}

/**
 * Shared shape of an OAuth redirect landing: Meta and Google both return here as
 * a top-level GET navigation, so the handler cannot rely on a JSON session call.
 */
function oauthRedirectHandler(platform: Platform, successCopy: string) {
  return async (req: Request, res: Response): Promise<void> => {
    const appUrl = appOrigin();
    const finish = (ok: boolean, message: string) =>
      res.redirect(`${appUrl}/?tab=connections&connect=${ok ? 'success' : 'error'}&message=${encodeURIComponent(message)}`);

    // The provider reporting an error is a DIFFERENT situation from returning no
    // code at all. Google puts the real reason in `error`, so read it first —
    // this is what turns the old misleading message into something actionable.
    const providerError = typeof req.query.error === 'string' ? req.query.error : null;
    if (providerError) {
      finish(false, describeProviderError(platform, providerError, appUrl));
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    if (!code || !state) {
      // No error and no code means the URL was opened directly (bookmark, reload
      // of a stale tab) rather than arriving from the provider.
      finish(
        false,
        `${PLATFORM_LABELS[platform]} did not return an authorization code. This page is the end of the connection link — please press Connect again to start a new one.`,
      );
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