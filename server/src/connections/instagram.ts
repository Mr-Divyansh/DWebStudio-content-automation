/**
 * INSTAGRAM CONNECTION ADAPTER — Meta / Facebook Login for Business
 * ============================================================================
 * User experience: Connect Instagram -> Meta's own authorization dialog/popup
 *                   -> Connected
 *
 * ----------------------------------------------------------------------------
 * WHICH OFFICIAL FLOW IS USED, AND WHY
 * ----------------------------------------------------------------------------
 * The Instagram Platform supports only PROFESSIONAL accounts (Instagram
 * Business or Creator) linked to a Facebook Page. For those, the supported
 * authorization mechanism is Facebook Login for Business
 * (https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login).
 * This adapter implements exactly that, and supports BOTH official launch
 * styles, choosing automatically:
 *
 *   1. Embedded Signup (preferred, same UX as WhatsApp) — when
 *      META_INSTAGRAM_CONFIG_ID is set. Uses Meta's official JS SDK FB.login
 *      with config_id and response_type=code, so the browser never sees a token.
 *   2. Classic Facebook OAuth dialog redirect — when only META_APP_ID and
 *      META_APP_SECRET are set. Standard server-side authorization-code flow.
 *
 * WHAT IS DELIBERATELY NOT DONE
 *  - No Instagram password is requested; Meta authenticates on its own domain.
 *  - No scraping, no Web-login automation, no cookie extraction, no session
 *    replay, no unofficial Instagram library.
 *  - No token is ever returned to the browser.
 *
 * SERVER-SIDE FLOW ONCE A CODE ARRIVES
 *   a. exchange the code for a short-lived user token
 *   b. upgrade it to a long-lived user token (fb_exchange_token)
 *   c. GET /me/accounts -> find the Page that has an instagram_business_account
 *   d. read the IGSID + username, then verify with a live Graph API call
 *   e. store the PAGE access token encrypted (what Instagram Messaging needs)
 *      plus non-secret ids in metadata
 *
 * ONE-TIME ADMINISTRATOR SETUP: see docs/CONNECTED_ACCOUNTS.md
 */

import { ConnectionService } from './connectionService.js';
import { ConnectionError, type VerifiedConnection, type Platform, callbackUri } from './types.js';
import type { AdapterStartContext, AdapterStartResult, PlatformAdapter } from './adapterTypes.js';

const GRAPH_VERSION = (process.env.META_GRAPH_API_VERSION ?? 'v21.0').replace(/^v/, '');

/**
 * `instagram_basic`            -> read the professional account identity.
 * `pages_show_list`            -> discover the linked Facebook Page.
 * `instagram_manage_messages`  -> required for Instagram DMs (what the Lead AI uses).
 * `business_management`        -> required for Tech Provider business onboarding.
 */
export const INSTAGRAM_SCOPES = [
  'instagram_basic',
  'pages_show_list',
  'instagram_manage_messages',
  'business_management',
];

export function instagramConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    appId: (env.META_APP_ID ?? '').trim(),
    appSecret: (env.META_APP_SECRET ?? '').trim(),
    /** Facebook Login for Business configuration id (Embedded Signup). */
    configId: (env.META_INSTAGRAM_CONFIG_ID ?? '').trim(),
    redirectUri: callbackUri('INSTAGRAM', env),
    graphVersion: `v${GRAPH_VERSION}`,
  };
}

export function isInstagramConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const cfg = instagramConfig(env);
  return Boolean(cfg.appId && cfg.appSecret);
}

/** True when the richer Embedded Signup flow is available. */
export function isInstagramEmbeddedSignupConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return isInstagramConfigured(env) && Boolean(instagramConfig(env).configId);
}
/** Server-to-server Graph API call. The app secret never leaves the server. */
async function graphGet(path: string, accessToken: string): Promise<Record<string, any>> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
  url.searchParams.set('access_token', accessToken);
  const res = await fetch(url.toString());
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok || json?.error) {
    // Meta's error body is verbose but is never echoed to the browser verbatim.
    throw new ConnectionError(
      'Meta rejected the Instagram authorization. The account must be an Instagram Business or Creator account linked to a Facebook Page.',
      400,
      'INSTAGRAM_GRAPH_ERROR',
    );
  }
  return json;
}

async function exchangeCode(code: string): Promise<string> {
  const cfg = instagramConfig();
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set('client_id', cfg.appId);
  url.searchParams.set('client_secret', cfg.appSecret);
  url.searchParams.set('code', code);
  const res = await fetch(url.toString());
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok || !json?.access_token) {
    throw new ConnectionError('Meta could not complete the Instagram sign-in. Please try again.', 400, 'INSTAGRAM_TOKEN_EXCHANGE_FAILED');
  }
  return String(json.access_token);
}

/** Upgrades the ~1 hour user token into a ~60 day long-lived token. */
async function toLongLived(userToken: string): Promise<string> {
  const cfg = instagramConfig();
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', cfg.appId);
  url.searchParams.set('client_secret', cfg.appSecret);
  url.searchParams.set('fb_exchange_token', userToken);
  const res = await fetch(url.toString());
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  // If Meta declines the upgrade we keep the shorter-lived token rather than
  // failing: the connection is still genuine, it just needs reconnecting sooner.
  return json?.access_token ? String(json.access_token) : userToken;
}

interface PageWithInstagram {
  id: string;
  name?: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string; name?: string };
}
/**
 * Finds the Facebook Page that owns the Instagram professional account and
 * returns the PAGE access token plus the Instagram identifiers.
 *
 * The Page token (not the user token) is what Instagram Messaging requires,
 * and it is the credential we therefore encrypt and store.
 */
async function resolveInstagramAccount(longLivedUserToken: string): Promise<{
  pageToken: string;
  pageId: string;
  pageName: string;
  igsid: string;
  username: string;
  profileName: string;
}> {
  const data = await graphGet(
    'me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}',
    longLivedUserToken,
  );
  const pages = (data?.data ?? []) as PageWithInstagram[];
  const withInstagram = pages.find((p) => p?.instagram_business_account?.id && p?.access_token);

  if (!withInstagram) {
    throw new ConnectionError(
      'No Instagram Business or Creator account linked to your Facebook Pages was found. Convert the account to Professional and link it to a Page, then reconnect.',
      400,
      'INSTAGRAM_NO_LINKED_ACCOUNT',
    );
  }

  const igsid = String(withInstagram.instagram_business_account!.id);
  const username = String(withInstagram.instagram_business_account!.username ?? '');

  // VERIFICATION: only trust the Page token because Meta accepts it here for
  // the specific Instagram user we are about to record.
  const profile = await graphGet(
    `${igsid}?fields=id,username,name`,
    withInstagram.access_token,
  );
  if (!profile?.id) {
    throw new ConnectionError('Meta could not verify this Instagram account.', 400, 'INSTAGRAM_VERIFY_FAILED');
  }

  return {
    pageToken: withInstagram.access_token,
    pageId: String(withInstagram.id),
    pageName: String(withInstagram.name ?? ''),
    igsid,
    username: String(profile.username ?? username),
    profileName: String(profile.name ?? withInstagram.instagram_business_account!.name ?? ''),
  };
}
const adapter: PlatformAdapter = {
  platform: 'INSTAGRAM' as Platform,

  isConfigured(): boolean {
    return isInstagramConfigured();
  },

  unavailableReason(): string | null {
    return isInstagramConfigured() ? null : 'Instagram sign-in has not been set up by the administrator yet.';
  },

  /**
   * Chooses the launch style automatically:
   *  - Embedded Signup popup when a configuration id is available (preferred).
   *  - Classic Facebook OAuth dialog redirect otherwise.
   */
  async start(ctx: AdapterStartContext): Promise<AdapterStartResult> {
    const cfg = instagramConfig();
    if (!cfg.appId || !cfg.appSecret) {
      throw new ConnectionError('Instagram sign-in is not available yet.', 503, 'INSTAGRAM_NOT_CONFIGURED');
    }

    if (cfg.configId) {
      return {
        kind: 'client',
        payload: {
          app_id: cfg.appId,
          config_id: cfg.configId,
          graph_version: cfg.graphVersion,
          // These scopes are declarative: the configuration id actually
          // determines what Meta shows, so they are informational for the UI.
          scopes: INSTAGRAM_SCOPES.join(','),
        },
      };
    }

    const { state } = await ConnectionService.createState('INSTAGRAM', cfg.redirectUri, ctx.userId);
    const url = new URL(`https://www.facebook.com/${cfg.graphVersion}/dialog/oauth`);
    url.searchParams.set('client_id', cfg.appId);
    url.searchParams.set('redirect_uri', cfg.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', INSTAGRAM_SCOPES.join(','));
    url.searchParams.set('state', state);
    return { kind: 'redirect', url: url.toString() };
  },

  /**
   * Completes the flow. A connection is only reported as CONNECTED after Meta
   * has verified both the token and the Instagram account it unlocks.
   */
  async complete(input: { code?: string } & Record<string, unknown>): Promise<VerifiedConnection> {
    if (!isInstagramConfigured()) {
      throw new ConnectionError('Instagram sign-in is not available yet.', 503, 'INSTAGRAM_NOT_CONFIGURED');
    }
    const code = String(input.code ?? '').trim();
    if (!code) throw new ConnectionError('Meta did not return an authorization code.', 400, 'INSTAGRAM_NO_CODE');

    const userToken = await exchangeCode(code);
    const longLived = await toLongLived(userToken);
    const account = await resolveInstagramAccount(longLived);

    return {
      // The IGSID is the stable identifier; the @username is presentation.
      externalAccountId: account.igsid,
      displayName: account.profileName || account.username || 'Instagram Professional Account',
      username: account.username ? `@${account.username.replace(/^@/, '')}` : null,
      scopes: INSTAGRAM_SCOPES,
      accessToken: account.pageToken,
      refreshToken: null,
      tokenExpiresAt: null,
      metadata: {
        igsid: account.igsid,
        igUsername: account.username,
        pageId: account.pageId,
        pageName: account.pageName,
      },
    };
  },

  /**
   * Meta revokes Page tokens through Business Manager rather than a per-user
   * HTTP call, so local deletion is the correct and complete action here.
   */
  async revoke(): Promise<void> {
    /* intentionally empty — revocation is managed in Meta Business Manager */
  },

  /** Re-verifies the stored Page token against the Graph API. */
  async verify(userId: string): Promise<{ ok: boolean; detail: string }> {
    const token = await ConnectionService.readAccessToken(userId, 'INSTAGRAM');
    const metadata = await ConnectionService.readMetadata(userId, 'INSTAGRAM');
    if (!token) return { ok: false, detail: 'No Instagram credential is stored.' };
    const igsid = metadata.igsid;
    if (!igsid) return { ok: false, detail: 'No Instagram account identifier is stored.' };
    try {
      const profile = await graphGet(`${igsid}?fields=id,username`, token);
      return {
        ok: Boolean(profile?.id),
        detail: profile?.id
          ? `Meta confirmed this Instagram account (@${profile.username ?? 'unknown'}).`
          : 'Meta did not return this Instagram account.',
      };
    } catch {
      return { ok: false, detail: 'Meta rejected the stored Instagram credential. Please reconnect.' };
    }
  },
};

export default adapter;