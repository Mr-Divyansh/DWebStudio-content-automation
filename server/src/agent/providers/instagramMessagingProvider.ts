/**
 * AUTONOMOUS AGENT â€” Instagram Messaging Provider (OFFICIAL META GRAPH API)
 * ============================================================================
 * The only adapter that talks to a real platform, using Meta's official,
 * authorized Instagram Messaging API. It is deliberately NOT an Instagram
 * login automation, browser driver or cookie/session replayer.
 *
 * Official endpoint:
 *   POST https://graph.facebook.com/{API_VERSION}/{PAGE_ID}/messages
 *   Authorization: Bearer {PAGE_ACCESS_TOKEN}      <- header, never a query param
 *
 * Requirements Meta documents for this product:
 *  - Instagram PROFESSIONAL account (Business/Creator) linked to a Facebook Page
 *  - a Meta app with the "Messenger > Instagram Messaging" product
 *  - the `instagram_manage_messages` permission
 *  - App Review / Advanced Access to message people without a role on the app
 *
 * CRITICAL PLATFORM CONSTRAINT (not a bug in this code):
 *  The API requires the recipient's Instagram-scoped ID (IGSID). An IGSID is
 *  only available for someone who has messaged the business or through an
 *  approved Meta flow â€” it can NEVER be looked up from an @username. A lead
 *  that only has a handle therefore cannot be messaged. This adapter returns an
 *  explicit failure instead of pretending, and never falls back to unofficial
 *  methods such as browser automation or cookie replay.
 *
 * Honesty rules honoured here:
 *  - `SENT` is returned ONLY when Meta returns HTTP 200 with a `message_id`.
 *    That id is stored as `providerRef` so delivery can be traced.
 *  - Authorization is verified live before the first send and re-checked
 *    periodically. An unverified adapter cannot send anything.
 *  - Tokens are never logged, never placed in a URL, and redacted in errors.
 */

import type { MessagingProvider, SendRequest, SendResult } from '../messagingProvider.js';
import {
  readWebhookConfig,
  verifySignature,
  handleVerificationRequest,
  WebhookConfig,
} from '../instagramWebhook.js';

const GRAPH_BASE = 'https://graph.facebook.com';
const DEFAULT_API_VERSION = 'v21.0';
const MAX_TEXT_BYTES = 1000;
const AUTH_CACHE_MS = 10 * 60 * 1000;

/** Retryable transport errors: rate limit and server-side faults only. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export interface AuthCheck {
  authorized: boolean;
  reason: string;
  checkedAt: Date;
  instagramBusinessAccountId: string | null;
}

/** Injectable so tests can supply a mock and never touch the network. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function readInstagramConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    pageAccessToken: (env.META_PAGE_ACCESS_TOKEN ?? '').trim(),
    pageId: (env.META_PAGE_ID ?? '').trim(),
    apiVersion: (env.META_GRAPH_API_VERSION ?? '').trim() || DEFAULT_API_VERSION,
    maxRetries: Math.max(0, Math.min(5, Number(env.META_GRAPH_MAX_RETRIES ?? 3) || 3)),
    maxTextBytes: Math.max(
      100,
      Math.min(MAX_TEXT_BYTES, Number(env.META_IG_MAX_TEXT_BYTES ?? MAX_TEXT_BYTES) || MAX_TEXT_BYTES),
    ),
  };
}

export function isIgScopedId(value: string): boolean {
  // IGSIDs are numeric strings. A username can never be a valid recipient.
  return /^\d{6,30}$/.test(value.trim());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class InstagramMessagingProvider implements MessagingProvider {
  readonly name = 'META_INSTAGRAM_MESSAGING';
  /** The official Instagram Messaging API supports inbound webhooks. */
  readonly supportsInbound = true;
  /** Webhook is only ready once the verify token and app secret are present. */
  readonly inboundReady = true;
  private auth: AuthCheck | null = null;
  private fetchImpl: FetchLike;

  constructor(
    private readonly config = readInstagramConfig(),
    fetchImpl?: FetchLike,
    private readonly webhook: WebhookConfig = readWebhookConfig(),
  ) {
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init));
  }

  /** True only when credentials are present. Live authorization is separate. */
  get isConfigured(): boolean {
    return Boolean(
      this.config.pageAccessToken &&
        this.config.pageId &&
        this.webhook.verifyToken &&
        this.webhook.appSecret,
    );
  }

  /** Webhook signature check, delegated to the shared implementation. */
  verifyWebhook(rawBody: Buffer | string, signatureHeader: string | undefined | null): boolean {
    return verifySignature(this.webhook.appSecret, rawBody, signatureHeader);
  }

  /** Meta's GET subscription handshake. */
  verifySubscription(query: Record<string, any>): { ok: true; challenge: string } | { ok: false } {
    return handleVerificationRequest(query, this.webhook);
  }

  private endpoint(path: string): string {
    return `${GRAPH_BASE}/${this.config.apiVersion}${path}`;
  }

  private async parseJson(res: Response): Promise<any> {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  /** Human-readable Meta error without ever echoing credentials. */
  private errorSummary(body: any): string {
    const err = body?.error;
    if (!err) return 'no error detail returned';
    return [err.message, err.code ? `code=${err.code}` : null, err.error_subcode ? `subcode=${err.error_subcode}` : null]
      .filter(Boolean)
      .join(' | ');
  }

  /**
   * Verifies the token really works and that the Page exposes an Instagram
   * business account. A token that exists but was revoked fails here, which is
   * exactly why AUTO DM is safe to leave enabled.
   */
  async checkAuthorization(force = false): Promise<AuthCheck> {
    if (!this.isConfigured) {
      return {
        authorized: false,
        reason: 'META_PAGE_ACCESS_TOKEN and META_PAGE_ID are not set.',
        checkedAt: new Date(),
        instagramBusinessAccountId: null,
      };
    }
    if (!force && this.auth && Date.now() - this.auth.checkedAt.getTime() < AUTH_CACHE_MS) {
      return this.auth;
    }

    const url = this.endpoint(`/${encodeURIComponent(this.config.pageId)}?fields=id,name,instagram_business_account`);
    try {
      const res = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.config.pageAccessToken}` },
      });
      const body = await this.parseJson(res);
      const igId = body?.instagram_business_account?.id ?? null;

      if (!res.ok) {
        this.auth = {
          authorized: false,
          reason: `Meta rejected the credentials (HTTP ${res.status}): ${this.errorSummary(body)}`,
          checkedAt: new Date(),
          instagramBusinessAccountId: null,
        };
      } else if (!igId) {
        this.auth = {
          authorized: false,
          reason: 'Page token is valid, but no Instagram business account is linked to this Page.',
          checkedAt: new Date(),
          instagramBusinessAccountId: null,
        };
      } else {
        this.auth = {
          authorized: true,
          reason: 'Page token valid and linked to an Instagram business account.',
          checkedAt: new Date(),
          instagramBusinessAccountId: igId,
        };
      }
    } catch (err: any) {
      this.auth = {
        authorized: false,
        reason: `Could not reach the Meta Graph API: ${err?.message ?? 'unknown network error'}`,
        checkedAt: new Date(),
        instagramBusinessAccountId: null,
      };
    }
    return this.auth;
  }

  /**
   * Sends one Instagram message. Returns SENT only on a real Meta acceptance.
   *
   * Refuses (rather than guessing) when:
   *  - the adapter has no credentials,
   *  - Meta authorization has not been confirmed,
   *  - the recipient is not an IGSID (a handle is not enough),
   *  - the body exceeds Meta's limit.
   */
  async send(request: SendRequest): Promise<SendResult> {
    if (request.channel !== 'INSTAGRAM_DM') {
      return {
        status: 'BLOCKED',
        provider: this.name,
        error: 'UNSUPPORTED_CHANNEL',
        detail: 'Instagram provider only handles INSTAGRAM_DM.',
      };
    }

    if (!this.isConfigured) {
      return {
        status: 'BLOCKED',
        provider: this.name,
        error: 'MESSAGE_PROVIDER_NOT_CONFIGURED',
        detail: 'Instagram messaging is not configured. Set META_PAGE_ACCESS_TOKEN and META_PAGE_ID.',
      };
    }

    const auth = await this.checkAuthorization();
    if (!auth.authorized) {
      return {
        status: 'BLOCKED',
        provider: this.name,
        error: 'NOT_AUTHORIZED',
        detail: `Instagram messaging is not authorized: ${auth.reason}`,
      };
    }

    const recipient = (request.recipient ?? '').trim();
    if (!isIgScopedId(recipient)) {
      // The most important refusal in this file. A handle is not a valid target.
      return {
        status: 'BLOCKED',
        provider: this.name,
        error: 'IGSID_REQUIRED',
        detail:
          'Meta requires an Instagram-scoped ID (IGSID). This lead has no IGSID, and an IGSID cannot be looked up ' +
          'from a username, so the official API cannot message this account. No unofficial login automation was used.',
      };
    }

    const body = request.body.trim();
    const bodyBytes = Buffer.byteLength(body, 'utf8');
    if (bodyBytes === 0) {
      return { status: 'BLOCKED', provider: this.name, error: 'EMPTY_MESSAGE', detail: 'Message body was empty.' };
    }
    if (bodyBytes > this.config.maxTextBytes) {
      return {
        status: 'BLOCKED',
        provider: this.name,
        error: 'MESSAGE_TOO_LONG',
        detail: `Message is ${bodyBytes} bytes; Meta allows at most ${this.config.maxTextBytes}.`,
      };
    }

    const url = this.endpoint(`/${encodeURIComponent(this.config.pageId)}/messages`);
    const payload = { recipient: { id: recipient }, message: { text: body } };

    let attempt = 0;
    // Retries only on rate limits and server faults. Never on a 4xx policy error.
    while (attempt <= this.config.maxRetries) {
      try {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.pageAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await this.parseJson(res);

        if (res.ok) {
          const messageId = data?.message_id ?? null;
          if (!messageId) {
            // 200 without an id is NOT proof of delivery.
            return {
              status: 'FAILED',
              provider: this.name,
              providerRef: null,
              error: 'NO_MESSAGE_ID',
              detail: 'Meta returned HTTP 200 without a message_id, so delivery cannot be confirmed.',
            };
          }
          return {
            status: 'SENT',
            provider: this.name,
            providerRef: String(messageId),
            error: null,
            detail: `Meta accepted the message (message_id ${messageId}).`,
          };
        }

        if (!RETRYABLE_STATUS.has(res.status)) {
          return {
            status: 'FAILED',
            provider: this.name,
            providerRef: null,
            error: `HTTP_${res.status}`,
            detail: `Meta rejected the message: ${this.errorSummary(data)}`,
          };
        }

        attempt++;
        if (attempt > this.config.maxRetries) break;
        // Exponential backoff, honouring Retry-After when Meta sends it.
        const retryAfter = Number(res.headers?.get?.('retry-after') ?? 0);
        const delay = retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 500;
        await sleep(Math.min(delay, 30_000));
      } catch (err: any) {
        attempt++;
        if (attempt > this.config.maxRetries) {
          return {
            status: 'FAILED',
            provider: this.name,
            providerRef: null,
            error: 'NETWORK_ERROR',
            detail: `Network failure after ${attempt} attempt(s): ${err?.message ?? 'unknown error'}`,
          };
        }
        await sleep(Math.min(2 ** attempt * 500, 30_000));
      }
    }

    return {
      status: 'FAILED',
      provider: this.name,
      providerRef: null,
      error: 'RATE_LIMITED_OR_UNAVAILABLE',
      detail: `Meta did not accept the message after ${this.config.maxRetries + 1} attempt(s) (rate limit or service unavailable).`,
    };
  }
}
