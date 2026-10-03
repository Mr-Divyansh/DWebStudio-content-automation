/**
 * WHATSAPP CONNECTION ADAPTER — Meta Embedded Signup (official Cloud API)
 * ============================================================================
 * User experience:  Connect WhatsApp -> Meta's own onboarding popup -> Connected
 *
 * ----------------------------------------------------------------------------
 * WHY THIS AND NOT A QR SCAN
 * ----------------------------------------------------------------------------
 * Scanning a WhatsApp Web QR code requires an unofficial client library,
 * hijacking the user's web session and storing that session. That violates
 * WhatsApp's Terms of Service, gets business numbers banned, and cannot be
 * shipped. It is therefore NOT implemented, not even behind a flag.
 *
 * The officially supported equivalent is Meta's Embedded Signup flow for the
 * WhatsApp Business Platform (Cloud API). The business owner authenticates with
 * Meta on Meta's own screens, grants our app access, and Meta hands us a WABA
 * id, a phone number id and a scoped business token.
 *
 * ONE-TIME DEVELOPER SETUP — done by the D Web Studio admin, ONCE, never by a
 * normal user (details in docs/CONNECTED_ACCOUNTS.md):
 *   1. Become a Meta Tech Provider and create a Business app.
 *   2. Add the "WhatsApp" product; apply for Advanced Access on
 *      whatsapp_business_management and whatsapp_business_messaging.
 *   3. Facebook Login for Business -> Configurations -> Embedded Signup; pick
 *      the Cloud API product and copy the CONFIGURATION ID.
 *   4. Register the redirect URI and add the app's domain to Allowed domains.
 *   5. Set META_APP_ID, META_APP_SECRET, META_EMBEDDED_SIGNUP_CONFIG_ID.
 *
 * NOTE ON AVAILABILITY / COST (stated plainly, never hidden):
 *   Embedded Signup is gated by Meta. If the app is not yet an approved Tech
 *   Provider with Advanced Access, Meta will refuse the flow. In that case this
 *   adapter reports NOT_CONFIGURED / an explicit error. It never pretends the
 *   account is connected, and it never substitutes an unofficial method.
 */

import { ConnectionError, type VerifiedConnection, type Platform } from './types.js';
import type { AdapterStartResult, PlatformAdapter } from './adapterTypes.js';

const GRAPH_VERSION = (process.env.META_GRAPH_API_VERSION ?? 'v21.0').replace(/^v/, '');

export function whatsappConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    appId: (env.META_APP_ID ?? '').trim(),
    appSecret: (env.META_APP_SECRET ?? '').trim(),
    configId: (env.META_EMBEDDED_SIGNUP_CONFIG_ID ?? '').trim(),
  };
}

export function isWhatsAppConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const cfg = whatsappConfig(env);
  return Boolean(cfg.appId && cfg.appSecret && cfg.configId);
}

/**
 * Exchanges the short-lived Embedded Signup code for a business token.
 * This is a SERVER-to-SERVER call — the app secret never leaves the server.
 */
async function exchangeCodeForToken(code: string): Promise<string> {
  const cfg = whatsappConfig();
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set('client_id', cfg.appId);
  url.searchParams.set('client_secret', cfg.appSecret);
  url.searchParams.set('code', code);
  const res = await fetch(url.toString());
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok || !json?.access_token) {
    throw new ConnectionError(
      'Meta could not complete WhatsApp authorization. This usually means the WhatsApp Business setup is not approved yet.',
      400,
      'WHATSAPP_TOKEN_EXCHANGE_FAILED',
    );
  }
  return String(json.access_token);
}

/** Reads the WABA id and business phone number id for the authorized business. */
async function discoverBusinessAssets(businessToken: string): Promise<{
  wabaId: string;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
}> {
  const headers = { Authorization: `Bearer ${businessToken}` };

  const wabaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me/whatsapp_business_accounts?fields=id,name`, { headers });
  const wabaJson = (await wabaRes.json().catch(() => ({}))) as { data?: Array<{ id: string; name?: string }> };
  const waba = wabaJson?.data?.[0];
  if (!waba?.id) {
    throw new ConnectionError(
      'No WhatsApp Business Account was shared with this app. Please complete the WhatsApp onboarding steps.',
      400,
      'WHATSAPP_NO_WABA',
    );
  }

  let phoneNumberId: string | null = null;
  let displayPhoneNumber: string | null = null;
  const phoneRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`,
    { headers },
  ).catch(() => null);
  if (phoneRes?.ok) {
    const phoneJson = (await phoneRes.json().catch(() => ({}))) as {
      data?: Array<{ id: string; display_phone_number?: string; verified_name?: string }>;
    };
    const first = phoneJson?.data?.[0];
    if (first?.id) {
      phoneNumberId = first.id;
      displayPhoneNumber = first.display_phone_number ?? null;
    }
  }

  return { wabaId: String(waba.id), phoneNumberId, displayPhoneNumber };
}
const adapter: PlatformAdapter = {
  platform: 'WHATSAPP' as Platform,

  isConfigured(): boolean {
    return isWhatsAppConfigured();
  },

  unavailableReason(): string | null {
    return isWhatsAppConfigured()
      ? null
      : 'WhatsApp Business setup is completed by the D Web Studio administrator (one time), not by you.';
  },

  /**
   * Embedded Signup runs inside our page using Meta's official JavaScript SDK
   * (FB.login with config_id). We return only the PUBLIC values the SDK needs —
   * the app secret is never sent to the browser.
   */
  async start(): Promise<AdapterStartResult> {
    if (!isWhatsAppConfigured()) {
      throw new ConnectionError('WhatsApp Business setup is not available yet.', 503, 'WHATSAPP_NOT_CONFIGURED');
    }
    const cfg = whatsappConfig();
    return {
      kind: 'client',
      payload: {
        app_id: cfg.appId,
        config_id: cfg.configId,
        graph_version: `v${GRAPH_VERSION}`,
      },
    };
  },

  /**
   * Exchanges the Embedded Signup authorization code and VERIFIES the result
   * against the Graph API before the caller may mark the account connected.
   * The code is single-use and expires ~30s after Embedded Signup returns it,
   * so the exchange happens immediately on receipt.
   */
  async complete(input: Record<string, unknown>): Promise<VerifiedConnection> {
    if (!isWhatsAppConfigured()) {
      throw new ConnectionError('WhatsApp Business setup is not available yet.', 503, 'WHATSAPP_NOT_CONFIGURED');
    }
    const code = String(input.code ?? '').trim();
    if (!code) throw new ConnectionError('WhatsApp did not return an authorization code.', 400, 'WHATSAPP_NO_CODE');

    const businessToken = await exchangeCodeForToken(code);
    const assets = await discoverBusinessAssets(businessToken);

    if (!assets.phoneNumberId) {
      throw new ConnectionError(
        'No business phone number is registered for this WhatsApp Business Account yet. Add a number in WhatsApp Manager and reconnect.',
        400,
        'WHATSAPP_NO_PHONE_NUMBER',
      );
    }

    return {
      externalAccountId: assets.wabaId,
      displayName: assets.displayPhoneNumber ? `+${assets.displayPhoneNumber}` : 'WhatsApp Business',
      username: null,
      scopes: ['whatsapp_business_messaging', 'whatsapp_business_management'],
      accessToken: businessToken,
      refreshToken: null,
      tokenExpiresAt: null,
      metadata: {
        wabaId: assets.wabaId,
        phoneNumberId: assets.phoneNumberId,
        displayPhoneNumber: assets.displayPhoneNumber ?? '',
      },
    };
  },

  /**
   * WhatsApp Business tokens are revoked through the Meta app, not per-user via
   * an HTTP call, so local deletion is the correct and complete action here.
   */
  async revoke(): Promise<void> {
    /* intentionally empty — revocation is managed in Meta Business Manager */
  },

  /** Re-verifies the stored token against the Graph API. */
  async verify(userId: string): Promise<{ ok: boolean; detail: string }> {
    const { ConnectionService } = await import('./connectionService.js');
    const token = await ConnectionService.readAccessToken(userId, 'WHATSAPP');
    const metadata = await ConnectionService.readMetadata(userId, 'WHATSAPP');
    if (!token) return { ok: false, detail: 'No WhatsApp Business credential is stored.' };
    const target = metadata.phoneNumberId || metadata.wabaId;
    if (!target) return { ok: false, detail: 'No WhatsApp business phone number is stored.' };
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${target}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (!res || !res.ok) {
      return { ok: false, detail: 'Meta rejected the stored WhatsApp credential. Please reconnect.' };
    }
    return { ok: true, detail: 'Meta confirmed this WhatsApp Business Account is authorized.' };
  },
};

export default adapter;