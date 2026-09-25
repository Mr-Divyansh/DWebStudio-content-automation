/**
 * INSTAGRAM WEBHOOK + REPLY ENGINE — Tests.
 * All fully mocked. No real network call and no real message is ever sent.
 */

import { createHmac } from 'crypto';
import {
  computeSignature,
  verifySignature,
  handleVerificationRequest,
  parseInboundEvents,
  readWebhookConfig,
  isWebhookConfigured,
} from '../server/src/agent/instagramWebhook.js';
import { classifyInbound } from '../server/src/agent/replyEngine.js';
import { InstagramMessagingProvider } from '../server/src/agent/providers/instagramMessagingProvider.js';

type Result = { name: string; passed: boolean; message?: string };

const APP_SECRET = 'test-app-secret-value';
const VERIFY_TOKEN = 'test-verify-token';
const IGSID = '17841400000000001';

const PROVIDER_CONFIG = {
  pageAccessToken: 'EAABtesttokenplaceholder',
  pageId: '1234567890',
  apiVersion: 'v21.0',
  maxRetries: 0,
  maxTextBytes: 1000,
};

const WEBHOOK_CONFIG = { verifyToken: VERIFY_TOKEN, appSecret: APP_SECRET };

/** Builds Meta's documented payload shape. */
function metaPayload(opts: {
  senderId?: string;
  mid?: string;
  text?: string;
  isEcho?: boolean;
  timestamp?: number;
  withMessage?: boolean;
}) {
  const messaging: any = {
    sender: { id: opts.senderId ?? IGSID },
    recipient: { id: '999888777' },
    timestamp: opts.timestamp ?? 1700000000000,
  };
  if (opts.withMessage !== false) {
    messaging.message = {
      mid: opts.mid ?? 'mid.TEST123',
      text: opts.text ?? 'Hello there',
      ...(opts.isEcho ? { is_echo: true } : {}),
    };
  }
  return { object: 'instagram', entry: [{ id: IGSID, time: 1700000000000, messaging: [messaging] }] };
}

export async function runWebhookTests(): Promise<Result[]> {
  const results: Result[] = [];
  const pass = (name: string, passed: boolean, message?: string) => results.push({ name, passed, message });

  try {
    /* 1. Signature generation matches Meta's documented format ------------------ */
    const raw = Buffer.from(JSON.stringify(metaPayload({})));
    const expected = `sha256=${createHmac('sha256', APP_SECRET).update(raw).digest('hex')}`;
    pass('Webhook: signature format matches Meta (sha256=...)', computeSignature(APP_SECRET, raw) === expected);

    /* 2. A correct signature validates --------------------------------------- */
    pass('Webhook: a correct signature is accepted', verifySignature(APP_SECRET, raw, expected));

    /* 3. A tampered body is rejected ----------------------------------------- */
    const tampered = Buffer.from(JSON.stringify(metaPayload({ text: 'tampered' })));
    pass('Webhook: a signature over a different body is rejected', !verifySignature(APP_SECRET, tampered, expected));

    /* 4. A wrong secret is rejected ------------------------------------------ */
    pass(
      'Webhook: a signature made with a different secret is rejected',
      !verifySignature('another-secret', raw, expected),
    );

    /* 5. Missing / malformed headers are rejected ----------------------------- */
    pass('Webhook: a missing signature header is rejected', !verifySignature(APP_SECRET, raw, undefined));
    pass('Webhook: a malformed signature header is rejected', !verifySignature(APP_SECRET, raw, 'garbage'));
    pass('Webhook: verification fails when no app secret is configured', !verifySignature('', raw, expected));

    /* 6. GET handshake: valid token echoes the challenge --------------------- */
    const ok = handleVerificationRequest(
      { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': 'CHALLENGE_123' },
      WEBHOOK_CONFIG,
    );
    pass('Webhook: valid verify token echoes the challenge', ok.ok && (ok as any).challenge === 'CHALLENGE_123');

    /* 7. GET handshake: wrong token / wrong mode / no challenge are refused -- */
    pass(
      'Webhook: a wrong verify token is refused',
      !handleVerificationRequest(
        { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': 'x' },
        WEBHOOK_CONFIG,
      ).ok,
    );

    /* 8. Payload parsing extracts the documented fields ------------------------ */
    const parsed = parseInboundEvents(metaPayload({ text: 'Interested please', mid: 'mid.A1' }));
    pass('Webhook: one event parsed from a valid payload', parsed.events.length === 1);
    const evt = parsed.events[0];
    pass(
      'Webhook: sender/mid/text/timestamp parsed correctly',
      evt.senderIgSid === IGSID &&
        evt.providerMessageId === 'mid.A1' &&
        evt.text === 'Interested please' &&
        evt.timestamp.getTime() === 1700000000000,
      `sender=${evt.senderIgSid} mid=${evt.providerMessageId}`,
    );
    pass('Webhook: a normal message is not flagged as an echo', evt.isEcho === false);

    /* 9. Echo detection prevents an infinite reply loop ----------------------- */
    const echo = parseInboundEvents(metaPayload({ isEcho: true, mid: 'mid.ECHO' }));
    pass('Webhook: our own echoed message is detected', echo.events[0].isEcho === true);

    /* 10. Non-message events (read receipts) are ignored ---------------------- */
    const receipt = parseInboundEvents(metaPayload({ withMessage: false }));
    pass('Webhook: a delivery/read receipt is ignored, not parsed', receipt.events.length === 0 && receipt.ignored === 1);

    /* 11. Malformed / empty payloads never throw ----------------------------- */
    pass('Webhook: an empty object yields no events', parseInboundEvents({}).events.length === 0);
    pass('Webhook: null input does not throw', parseInboundEvents(null).events.length === 0);
    pass('Webhook: garbage entry arrays do not throw', parseInboundEvents({ entry: 'nope' }).events.length === 0);

    /* 12. A message with no sender id is skipped safely ---------------------- */
    const noSender = parseInboundEvents({
      object: 'instagram',
      entry: [{ messaging: [{ message: { mid: 'mid.NOSENDER', text: 'hi' } }] }],
    });
    pass('Webhook: a message without sender.id is ignored', noSender.events.length === 0);

    /* 13. Webhook config detection ------------------------------------------- */
    pass(
      'Webhook: config is detected only when token AND secret are present',
      isWebhookConfigured(WEBHOOK_CONFIG) && !isWebhookConfigured({ verifyToken: '', appSecret: '' }),
    );
    pass(
      'Webhook: env reading pulls the verify token and app secret',
      readWebhookConfig({ META_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN, META_APP_SECRET: APP_SECRET } as any).appSecret ===
        APP_SECRET,
    );

    /* 14. The provider exposes the official webhook surface ------------------ */
    const provider = new InstagramMessagingProvider(PROVIDER_CONFIG, undefined, WEBHOOK_CONFIG);
    pass('Webhook: Instagram adapter reports inbound support', provider.supportsInbound === true);
    pass('Webhook: Instagram adapter implements signature verification', typeof provider.verifyWebhook === 'function');
    pass('Webhook: Instagram adapter accepts a correct signature', provider.verifyWebhook(raw, expected) === true);
    pass('Webhook: Instagram adapter rejects a bad signature', provider.verifyWebhook(raw, 'sha256=deadbeef') === false);
    pass(
      'Webhook: Instagram adapter handles the subscription handshake',
      provider.verifySubscription?.({
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': 'C1',
      }).ok === true,
    );

    /* 15. Without webhook secrets the adapter is not considered configured -- */
    const noWebhook = new InstagramMessagingProvider(PROVIDER_CONFIG, undefined, { verifyToken: '', appSecret: '' });
    pass('Webhook: missing webhook secrets means not configured', noWebhook.isConfigured === false);

    /* 16. Deterministic escalation classification ----------------------------- */
    pass('Reply: an opt-out phrase is detected', classifyInbound('please stop messaging me').optOut === true);
    pass('Reply: "unsubscribe" is detected', classifyInbound('unsubscribe').optOut === true);
    pass('Reply: a request for the owner escalates', classifyInbound('can I speak to the owner?').wantsOwner === true);
    pass('Reply: a contract question escalates', classifyInbound('can you send the contract?').escalation !== null);
    pass('Reply: a payment question escalates', classifyInbound('how do I pay the invoice?').escalation !== null);
    pass('Reply: an app request escalates', classifyInbound('I need a mobile app built').escalation !== null);
    pass('Reply: an ordinary message needs no escalation', classifyInbound('what services do you offer?').escalation === null);
  } catch (err: any) {
    pass('Webhook: test block completed without an unexpected error', false, err?.message);
  }

  return results;
}
