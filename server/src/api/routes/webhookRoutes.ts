/**
 * INSTAGRAM WEBHOOK — Official Meta flow.
 *
 * GET  : Meta's subscription handshake (hub.mode / hub.verify_token / hub.challenge).
 * POST : Message delivery, accepted ONLY when X-Hub-Signature-256 matches the
 *        HMAC-SHA256 of the raw body using the app secret.
 *
 * The route always answers 200 quickly for verified deliveries so Meta does not
 * retry-storm, and performs the actual work inline. Nothing is logged verbatim.
 */

import { Router } from 'express';
import { getMessagingProvider } from '../../agent/messagingProvider.js';
import { parseInboundEvents, readWebhookConfig, isWebhookConfigured } from '../../agent/instagramWebhook.js';
import { processInboundMessage } from '../../agent/replyEngine.js';

export const webhookRouter = Router();

/** Meta subscription handshake. */
webhookRouter.get('/instagram', (req, res) => {
  const provider = getMessagingProvider();

  if (typeof provider.verifySubscription !== 'function') {
    return res.status(404).send('Webhook not supported by the active provider.');
  }

  const result = provider.verifySubscription(req.query as Record<string, any>);
  if (!result.ok) {
    // Reject without echoing anything, and without revealing the expected token.
    return res.status(403).send('Verification failed.');
  }
  // Meta requires the raw challenge string as the response body.
  return res.status(200).send(result.challenge);
});

/** Meta message delivery. */
webhookRouter.post('/instagram', async (req, res) => {
  const provider = getMessagingProvider();

  if (typeof provider.verifyWebhook !== 'function') {
    return res.status(404).json({ error: 'Webhook not supported by the active provider.' });
  }

  const rawBody = (req as any).rawBody;
  if (!rawBody) {
    return res.status(400).json({ error: 'Missing raw body; signature cannot be verified.' });
  }

  const signature = req.get('x-hub-signature-256') || req.get('X-Hub-Signature-256');
  if (!provider.verifyWebhook(rawBody, signature)) {
    // Invalid signature: reject and do not parse or act on the payload.
    return res.status(401).json({ error: 'Invalid webhook signature.' });
  }

  const { events, ignored } = parseInboundEvents(req.body);
  const results: Array<{ providerMessageId: string; decision: string }> = [];

  for (const event of events) {
    try {
      const outcome = await processInboundMessage(event);
      results.push({ providerMessageId: outcome.providerMessageId, decision: outcome.decision });
    } catch (err: any) {
      // One bad event must not fail the whole delivery.
      results.push({ providerMessageId: event.providerMessageId, decision: 'ERROR' });
      console.error('[instagram-webhook] processing failed:', err?.message);
    }
  }

  return res.status(200).json({ received: events.length, ignored, results });
});

/** Operator-facing webhook readiness. Never returns a secret. */
webhookRouter.get('/instagram/status', (_req, res) => {
  const config = readWebhookConfig();
  const provider = getMessagingProvider();
  res.json({
    configured: isWebhookConfigured(config),
    supported: typeof provider.verifyWebhook === 'function',
    active: provider.supportsInbound === true && isWebhookConfigured(config),
    provider: provider.name,
    endpointPath: '/api/webhooks/instagram',
    requiredSubscriptionFields: ['messages', 'messaging_postbacks', 'message_reads', 'message_reactions'],
  });
});
