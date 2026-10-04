/**
 * GMAIL CONNECTION ADAPTER — Google OAuth 2.0 (Authorization Code + PKCE)
 * ============================================================================
 * User experience: Connect Gmail -> Google's own sign-in/consent screen
 *                   -> Connected
 *
 * Implements the standard Google OAuth 2.0 web-server flow documented at
 * https://developers.google.com/identity/protocols/oauth2/web-server
 *
 * WHAT IS DELIBERATELY NOT DONE
 *  - The Gmail password is never requested, seen, or stored. Google
 *    authenticates on accounts.google.com; we only receive an authorization code.
 *  - No user is ever asked to paste an access token or refresh token.
 *  - No unofficial IMAP/POP login automation.
 *  - No token is ever returned to the browser.
 *
 * SCOPES — MINIMUM ONLY
 * ----------------------------------------------------------------------------
 *   gmail.readonly -> read messages and threads. This is the least-privilege
 *                     scope that lets the Lead AI work with a mailbox.
 *   userinfo.email -> the verified account address, shown in the UI.
 *   openid         -> required to call the OpenID Connect userinfo endpoint.
 *
 * `gmail.send` / `gmail.modify` are deliberately NOT requested: this app does
 * not yet send mail, so asking for write access would violate least privilege.
 * Widen the scope deliberately when sending is implemented.
 *
 * WHY `access_type=offline` AND `prompt=consent`
 * Google only issues a refresh token when it is asked for offline access. The
 * refresh token is what lets the Lead AI keep working after the user leaves;
 * without it every session would expire in one hour.
 *
 * ONE-TIME ADMINISTRATOR SETUP: docs/CONNECTED_ACCOUNTS.md
 */

import { createHash } from 'node:crypto';
import { ConnectionService } from './connectionService.js';
import { ConnectionError, type VerifiedConnection, type Platform, callbackUri } from './types.js';
import type { AdapterStartContext, AdapterStartResult, PlatformAdapter } from './adapterTypes.js';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const GMAIL_PROFILE_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
];

export function gmailConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    clientId: (env.GOOGLE_CLIENT_ID ?? '').trim(),
    clientSecret: (env.GOOGLE_CLIENT_SECRET ?? '').trim(),
    // Derived from the single appOrigin() helper so this can never become a
    // relative URL (which Google cannot match) if APP_URL is unset.
    redirectUri: callbackUri('GMAIL', env),
  };
}

export function isGmailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const cfg = gmailConfig(env);
  return Boolean(cfg.clientId && cfg.clientSecret);
}

/** PKCE S256 challenge. */
function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** Google's token endpoint requires form encoding, not JSON. */
async function postToken(form: Record<string, string>): Promise<Record<string, any>> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) {
    // `error` is a stable OAuth code (invalid_grant, access_denied, ...);
    // Google's response body itself is never echoed to the browser.
    throw new ConnectionError(
      'Google could not complete the sign-in. Please try again.',
      400,
      `GMAIL_${String(json?.error ?? 'TOKEN_EXCHANGE_FAILED').toUpperCase()}`,
    );
  }
  return json;
}
/**
 * Confirms the token against Google's OpenID Connect endpoint and the Gmail
 * API itself. Verifying against BOTH proves (a) the identity and (b) that the
 * gmail.readonly grant actually works, rather than trusting the token blindly.
 */
async function verifyWithGoogle(accessToken: string): Promise<{
  subject: string;
  email: string;
  emailVerified: string;
  name: string;
  picture: string;
  threadsTotal: string;
  messagesTotal: string;
}> {
  const identityRes = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const identity = (await identityRes.json().catch(() => ({}))) as Record<string, any>;
  if (!identityRes.ok || !identity?.email) {
    throw new ConnectionError('Google could not verify this authorization. Please reconnect.', 400, 'GMAIL_VERIFY_FAILED');
  }

  // Second, independent check against the Gmail API surface itself.
  const profileRes = await fetch(GMAIL_PROFILE_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = (await profileRes.json().catch(() => ({}))) as Record<string, any>;
  if (!profileRes.ok) {
    throw new ConnectionError(
      'Google did not grant mailbox access for this account. Please reconnect and accept the Gmail permission.',
      400,
      'GMAIL_SCOPE_NOT_GRANTED',
    );
  }

  return {
    subject: String(identity.sub ?? ''),
    email: String(identity.email),
    emailVerified: identity.email_verified ? 'true' : 'false',
    name: String(identity.name ?? ''),
    picture: String(identity.picture ?? ''),
    threadsTotal: String(profile.threadsTotal ?? ''),
    messagesTotal: String(profile.messagesTotal ?? ''),
  };
}
const adapter: PlatformAdapter = {
  platform: 'GMAIL' as Platform,

  isConfigured(): boolean {
    return isGmailConfigured();
  },

  unavailableReason(): string | null {
    return isGmailConfigured() ? null : 'Gmail sign-in has not been set up by the administrator yet.';
  },

  /** Full-page redirect to Google's own consent screen. */
  async start(ctx: AdapterStartContext): Promise<AdapterStartResult> {
    const cfg = gmailConfig();
    if (!cfg.clientId || !cfg.clientSecret) {
      throw new ConnectionError('Gmail sign-in is not available yet.', 503, 'GMAIL_NOT_CONFIGURED');
    }
    const { state, codeVerifier } = await ConnectionService.createState('GMAIL', cfg.redirectUri, ctx.userId);

    const url = new URL(AUTH_ENDPOINT);
    url.searchParams.set('client_id', cfg.clientId);
    url.searchParams.set('redirect_uri', cfg.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GMAIL_SCOPES.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', pkceChallenge(codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
    // offline -> ask Google for a refresh token
    // consent -> force the consent screen so a refresh token is issued
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('include_granted_scopes', 'true');
    return { kind: 'redirect', url: url.toString() };
  },

  /**
   * Completes the flow. Only returns after Google has confirmed both the
   * identity and the Gmail grant.
   */
  async complete(input: { code?: string; codeVerifier?: string } & Record<string, unknown>): Promise<VerifiedConnection> {
    const cfg = gmailConfig();
    if (!cfg.clientId || !cfg.clientSecret) {
      throw new ConnectionError('Gmail sign-in is not available yet.', 503, 'GMAIL_NOT_CONFIGURED');
    }
    const code = String(input.code ?? '').trim();
    const codeVerifier = String(input.codeVerifier ?? '');
    if (!code) throw new ConnectionError('Google did not return an authorization code.', 400, 'GMAIL_NO_CODE');
    if (!codeVerifier) throw new ConnectionError('This Gmail authorization could not be verified.', 400, 'GMAIL_NO_VERIFIER');

    const token = await postToken({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    });

    if (!token?.access_token) {
      throw new ConnectionError('Google did not return an access token.', 400, 'GMAIL_NO_TOKEN');
    }

    const verified = await verifyWithGoogle(String(token.access_token));

    return {
      // Google's stable subject id identifies the account across renames.
      externalAccountId: verified.subject || verified.email,
      displayName: verified.name || verified.email,
      username: verified.email,
      scopes: String(token.scope ?? GMAIL_SCOPES.join(' ')).split(/\s+/).filter(Boolean),
      accessToken: String(token.access_token),
      refreshToken: token.refresh_token ? String(token.refresh_token) : null,
      tokenExpiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null,
      metadata: {
        email: verified.email,
        emailVerified: verified.emailVerified,
        googleSubject: verified.subject,
        profileName: verified.name,
        pictureUrl: verified.picture,
        threadsTotal: verified.threadsTotal,
        messagesTotal: verified.messagesTotal,
      },
    };
  },

  /** Best-effort revocation so the grant dies at Google's end too. */
  async revoke(userId: string): Promise<void> {
    const token = await ConnectionService.readAccessToken(userId, 'GMAIL');
    if (!token) return;
    // Google answers 200 even for an unknown token, so the result is not inspected.
    await fetch(REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    }).catch(() => undefined);
  },

  /** Re-checks the stored token with Google so status is never stale. */
  async verify(userId: string): Promise<{ ok: boolean; detail: string }> {
    const token = await ConnectionService.readAccessToken(userId, 'GMAIL');
    if (!token) return { ok: false, detail: 'No Gmail credential is stored.' };
    try {
      const verified = await verifyWithGoogle(token);
      return { ok: true, detail: `Google confirmed ${verified.email}.` };
    } catch {
      return {
        ok: false,
        detail: 'Google no longer accepts this authorization. It may have expired or been revoked — please reconnect.',
      };
    }
  },
};

export default adapter;