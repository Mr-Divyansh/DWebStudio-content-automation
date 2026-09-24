/**
 * AUTONOMOUS AGENT — Messaging Provider Interface
 * ============================================================================
 * The autonomous agent never talks to Instagram, WhatsApp or any platform SDK
 * directly. It only ever talks to THIS interface.
 *
 * Why an interface and not a sender:
 *  - No authorized provider/account is connected to this project today.
 *  - Unofficial Instagram/WhatsApp automation violates platform terms, can get
 *    the owner's account banned, and can message the wrong person.
 *  - Therefore the only adapter shipped here is `DryRunMessagingProvider`, which
 *    records what WOULD be sent and reports DRY_RUN. `status: 'SENT'` is
 *    impossible unless a real adapter returns a provider delivery reference.
 *
 * To enable real sending later you must supply an adapter that:
 *  1. uses an official, authorized API for the channel,
 *  2. authenticates with credentials stored outside Git (env vars),
 *  3. honours platform rate limits, opt-outs and messaging policies,
 *  4. returns a real provider message id on confirmed delivery.
 * Register it in `getMessagingProvider()` below.
 */

import { createHash } from 'crypto';
import { InstagramMessagingProvider } from './providers/instagramMessagingProvider.js';

export type OutboundChannel = 'INSTAGRAM_DM' | 'WHATSAPP' | 'EMAIL';

export interface SendRequest {
  leadId: string;
  channel: OutboundChannel;
  recipient: string | null;
  body: string;
  /** Stable hash used to block duplicate sends for the same lead + content. */
  contentHash: string;
}

export interface SendResult {
  status: 'SENT' | 'DRY_RUN' | 'BLOCKED' | 'FAILED';
  provider: string;
  providerRef?: string | null;
  error?: string | null;
  /** Human-readable reason shown verbatim in the UI. Never claims a real send. */
  detail: string;
}

export interface MessagingProvider {
  readonly name: string;
  /** False until an authorized adapter is registered. UI shows "Messaging integration required". */
  readonly isConfigured: boolean;
  send(request: SendRequest): Promise<SendResult>;

  /**
   * OPTIONAL capabilities. Adapters that cannot receive messages simply omit
   * these, and the agent reports the capability as NOT SUPPORTED rather than
   * pretending. Keeping them optional preserves the dry-run adapter unchanged.
   */
  /** Live check that credentials are accepted by the provider. */
  checkAuthorization?(force?: boolean): Promise<{ authorized: boolean; reason: string }>;
  /** Whether this adapter can receive inbound messages at all. */
  readonly supportsInbound?: boolean;
  /** Whether an inbound webhook is registered and verified. */
  readonly inboundReady?: boolean;
  /** Verifies a webhook signature. Present only when the provider defines one. */
  verifyWebhook?(rawBody: Buffer | string, signatureHeader: string | undefined | null): boolean;
  /** Handles the GET subscription handshake. */
  verifySubscription?(query: Record<string, any>): { ok: true; challenge: string } | { ok: false };
}

export function hashMessage(leadId: string, body: string): string {
  return createHash('sha256').update(`${leadId}::${body.trim()}`).digest('hex');
}

/**
 * The only adapter enabled in this build. It performs NO network call.
 * Every send is logged with status DRY_RUN and an explicit explanation.
 */
class DryRunMessagingProvider implements MessagingProvider {
  readonly name = 'DRY_RUN';
  readonly isConfigured = false;
  /** A dry-run adapter can never receive anything. */
  readonly supportsInbound = false;
  readonly inboundReady = false;

  async send(request: SendRequest): Promise<SendResult> {
    return {
      status: 'DRY_RUN',
      provider: this.name,
      providerRef: null,
      error: null,
      detail: 'Messaging integration required — no authorized provider connected. Nothing was sent.',
    };
  }
}

let activeProvider: MessagingProvider = new DryRunMessagingProvider();

/** Registration point for an authorized adapter. Nothing else needs to change. */
export function registerMessagingProvider(provider: MessagingProvider): void {
  activeProvider = provider;
}

export function getMessagingProvider(): MessagingProvider {
  return activeProvider;
}

/**
 * Chooses the active adapter from the environment.
 *
 * MESSAGING_PROVIDER:
 *   'instagram' -> official Meta Instagram Messaging API (also the default when
 *                  its credentials are present)
 *   'dry_run'   -> no network calls at all (safe default, and what tests use)
 *
 * NOTE: the Instagram adapter is only selected when META_PAGE_ACCESS_TOKEN and
 * META_PAGE_ID are both set. Even then it verifies authorization live and
 * refuses to send without a valid IGSID, so selecting it can never produce an
 * unverified delivery.
 */
export function selectMessagingProvider(env: NodeJS.ProcessEnv = process.env): MessagingProvider {
  const requested = (env.MESSAGING_PROVIDER ?? '').trim().toLowerCase();
  const hasMetaCreds = Boolean((env.META_PAGE_ACCESS_TOKEN ?? '').trim() && (env.META_PAGE_ID ?? '').trim());

  if (requested === 'dry_run') return new DryRunMessagingProvider();

  if (requested === 'instagram' || (requested === '' && hasMetaCreds)) {
    if (!hasMetaCreds) return new DryRunMessagingProvider();
    return new InstagramMessagingProvider();
  }

  return new DryRunMessagingProvider();
}

/** Wire-up performed once during server startup. */
export function initializeMessagingProviders(): void {
  registerMessagingProvider(selectMessagingProvider());
}


/** UI/API status helper. Never exposes secrets. */
export function getMessagingStatus() {
  const provider = getMessagingProvider();
  return {
    provider: provider.name,
    configured: provider.isConfigured,
    label: provider.isConfigured ? 'CONNECTED' : 'MESSAGE_PROVIDER_NOT_CONFIGURED',
    requirement: provider.isConfigured
      ? null
      : 'Messaging integration required. Connect an authorized provider to enable real delivery.',
  };
}