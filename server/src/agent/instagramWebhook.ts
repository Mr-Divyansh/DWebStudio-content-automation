/**
 * AUTONOMOUS AGENT — Instagram Webhook (OFFICIAL META FLOW)
 * ============================================================================
 * Implements Meta's documented webhook contract for the Instagram Messaging API:
 *
 *  1. GET verification handshake:
 *       GET /webhook?hub.mode=subscribe
 *                 &hub.verify_token=<VERIFY_TOKEN>
 *                 &hub.challenge=<CHALLENGE>
 *     We must echo `hub.challenge` as the raw response body, and only when
 *     `hub.verify_token` matches our configured value.
 *
 *  2. POST delivery with integrity header:
 *       X-Hub-Signature-256: sha256=<HMAC_SHA256(app_secret, RAW_REQUEST_BODY)>
 *     The digest MUST be computed over the exact raw bytes. Any mismatch is
 *     rejected with 401 and the payload is discarded unparsed.
 *
 *  3. Payload shape (documented by Meta):
 *       { object, entry: [ { id, time, messaging: [
 *           { sender: { id }, recipient: { id }, timestamp, message: { mid, text } } ] } ] }
 *     `sender.id` is the Instagram-scoped ID (IGSID) of the person messaging us,
 *     which is exactly the identifier the official send API requires.
 *
 * Nothing here authenticates a user, replays a session, or scrapes anything.
 */

import { createHmac, timingSafeEqual } from 'crypto';

/* ------------------------------------------------------------ configuration */

export interface WebhookConfig {
  verifyToken: string;
  appSecret: string;
}

export function readWebhookConfig(env: NodeJS.ProcessEnv = process.env): WebhookConfig {
  return {
    verifyToken: (env.META_WEBHOOK_VERIFY_TOKEN ?? '').trim(),
    appSecret: (env.META_APP_SECRET ?? '').trim(),
  };
}

export function isWebhookConfigured(config: WebhookConfig): boolean {
  return Boolean(config.verifyToken && config.appSecret);
}

/* -------------------------------------------------------------- verification */

/** Computes Meta's documented signature for a raw body. */
export function computeSignature(appSecret: string, rawBody: Buffer | string): string {
  return `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
}

/**
 * Constant-time comparison of the X-Hub-Signature-256 header.
 * Returns false for a missing header, a malformed header, or a length mismatch.
 */
export function verifySignature(appSecret: string, rawBody: Buffer | string, header: string | undefined | null): boolean {
  if (!appSecret || !header) return false;
  const expected = computeSignature(appSecret, rawBody);
  const received = header.trim();

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Meta's GET handshake. Returns the challenge to echo, or null to reject. */
export function handleVerificationRequest(
  query: Record<string, any>,
  config: WebhookConfig,
): { ok: true; challenge: string } | { ok: false } {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  if (mode !== 'subscribe') return { ok: false };
  if (!config.verifyToken || token !== config.verifyToken) return { ok: false };
  if (typeof challenge !== 'string' || challenge.length === 0) return { ok: false };
  return { ok: true, challenge };
}

/* ------------------------------------------------------------ payload parsing */

export interface InboundMessageEvent {
  /** Instagram-scoped ID of the person who messaged the business. */
  senderIgSid: string;
  /** Our own Page/business ID that received it. */
  recipientIgSid: string | null;
  /** Meta's message id, used for idempotency. */
  providerMessageId: string;
  text: string;
  timestamp: Date;
  /** True when Meta echoes a message WE sent — must never trigger a reply. */
  isEcho: boolean;
  attachments: string[];
}

/**
 * Extracts inbound message events from a Meta webhook body.
 * Unsupported/irrelevant events (e.g. our own echoes, non-text attachments) are
 * either flagged or skipped rather than guessed at.
 */
export function parseInboundEvents(body: any): { events: InboundMessageEvent[]; ignored: number } {
  const events: InboundMessageEvent[] = [];
  let ignored = 0;

  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const messages = Array.isArray(entry?.messaging) ? entry.messaging : [];
    for (const messaging of messages) {
      const message = messaging?.message;
      const mid = message?.mid;
      const senderId = messaging?.sender?.id;

      // A delivery receipt or read event carries no message payload.
      if (!message || typeof mid !== 'string' || mid.length === 0) {
        ignored++;
        continue;
      }
      if (typeof senderId !== 'string' || senderId.length === 0) {
        ignored++;
        continue;
      }

      const timestampRaw = Number(messaging?.timestamp);
      const timestamp = Number.isFinite(timestampRaw) && timestampRaw > 0
        ? new Date(timestampRaw)
        : new Date();

      const attachments: string[] = [];
      for (const attachment of Array.isArray(message.attachments) ? message.attachments : []) {
        if (typeof attachment?.type === 'string') attachments.push(attachment.type);
      }

      const text = typeof message.text === 'string' ? message.text : '';

      events.push({
        senderIgSid: senderId,
        recipientIgSid: typeof messaging?.recipient?.id === 'string' ? messaging.recipient.id : null,
        providerMessageId: mid,
        text,
        timestamp,
        isEcho: message.is_echo === true,
        attachments,
      });
    }
  }

  return { events, ignored };
}
