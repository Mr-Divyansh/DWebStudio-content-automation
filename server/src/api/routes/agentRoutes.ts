/**
 * AUTONOMOUS AGENT — API
 * ============================================================================
 * Control surface for the existing app. Every response is derived from real
 * database rows; nothing is fabricated. There is deliberately NO endpoint that
 * sends a message: sends only ever happen inside the gated agent loop.
 */

import { Router } from 'express';
import { prisma } from '../../database/client.js';
import { AutonomousAgent } from '../../agent/autonomousAgent.js';
import { AgentLearningStore } from '../../agent/learningStore.js';
import { PricingService } from '../../agent/pricing.js';
import { getMessagingStatus, getMessagingProvider } from '../../agent/messagingProvider.js';
import { readWebhookConfig, isWebhookConfigured } from '../../agent/instagramWebhook.js';

export const agentRouter = Router();

/** Full control-centre status: state, AUTO DM, counters, messaging readiness. */
agentRouter.get('/status', async (_req, res) => {
  try {
    res.json(await AutonomousAgent.getStatus());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to read agent status' });
  }
});

agentRouter.post('/start', async (_req, res) => {
  try {
    res.json(await AutonomousAgent.start());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to start agent' });
  }
});

agentRouter.post('/pause', async (_req, res) => {
  try {
    res.json(await AutonomousAgent.pause());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to pause agent' });
  }
});

agentRouter.post('/stop', async (_req, res) => {
  try {
    res.json(await AutonomousAgent.stop());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to stop agent' });
  }
});

/** AUTO DM ON/OFF. Purely a switch; it still cannot send without a provider. */
agentRouter.post('/auto-dm', async (req, res) => {
  try {
    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }
    res.json(await AutonomousAgent.setAutoDm(enabled));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to update AUTO DM' });
  }
});

/** Human take-over / release / opt-out, per lead. */
agentRouter.post('/leads/:id/takeover', async (req, res) => {
  try {
    res.json(await AutonomousAgent.takeOver(req.params.id));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to take over lead' });
  }
});

agentRouter.post('/leads/:id/release', async (req, res) => {
  try {
    res.json(await AutonomousAgent.release(req.params.id));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to release lead' });
  }
});

agentRouter.post('/leads/:id/opt-out', async (req, res) => {
  try {
    res.json(await AutonomousAgent.optOut(req.params.id));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to record opt-out' });
  }
});

/** Run a single batch now (also used by tests). Requires the agent to be RUNNING. */
agentRouter.post('/tick', async (_req, res) => {
  try {
    res.json(await AutonomousAgent.tick());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Agent tick failed' });
  }
});

/** Recent real activity. Never contains private message bodies. */
agentRouter.get('/activity', async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '40'), 10) || 40, 200);
    const events = await prisma.agentEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { lead: { select: { id: true, businessName: true, status: true } } },
    });
    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load activity' });
  }
});

/** Outbound log. `status` is the honest outcome: SENT, DRY_RUN, BLOCKED or FAILED. */
agentRouter.get('/messages', async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '40'), 10) || 40, 200);

/** Inbound replies received from the official provider webhook. */
agentRouter.get('/inbox', async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '40'), 10) || 40, 200);
    const messages = await prisma.inboundMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { lead: { select: { id: true, businessName: true, status: true, aiPaused: true } } },
    });
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load inbound messages' });
  }
});

/* --------------------------------------------------------------- learning */

agentRouter.get('/learnings', async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
    res.json(await AgentLearningStore.list(limit));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load learning events' });
  }
});

/** Human-only promotion. AI-proposed rules are never auto-approved. */
agentRouter.post('/learnings/:id/status', async (req, res) => {
  try {
    const { status } = req.body ?? {};
    if (!['PROPOSED', 'APPROVED', 'REJECTED', 'ARCHIVED'].includes(status)) {
      return res.status(400).json({ error: 'status must be PROPOSED, APPROVED, REJECTED or ARCHIVED' });
    }
    res.json(await AgentLearningStore.setStatus(req.params.id, status));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to update learning status' });
  }
});

/* ---------------------------------------------------------------- pricing */

agentRouter.get('/pricing', async (_req, res) => {
  try {
    res.json(await PricingService.listRules());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load pricing rules' });
  }
});

agentRouter.post('/pricing', async (req, res) => {
  try {
    const body = req.body ?? {};
    const rule = await PricingService.upsertRule({
      service: String(body.service || '').trim(),
      currency: body.currency ? String(body.currency) : undefined,
      minPrice: Number(body.minPrice),
      normalPriceMin: Number(body.normalPriceMin),
      normalPriceMax: Number(body.normalPriceMax),
      maxNegotiation: Number(body.maxNegotiation),
      escalationAbove: body.escalationAbove == null ? null : Number(body.escalationAbove),
      active: body.active !== false,
      notes: body.notes ? String(body.notes) : null,
    });
    res.json(rule);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to save pricing rule' });
  }
});

    const messages = await prisma.outboundMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { lead: { select: { id: true, businessName: true, status: true, aiPaused: true } } },
    });
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load outbound log' });
  }
});

/** Messaging readiness only — never returns credentials. */
agentRouter.get('/messaging', async (_req, res) => {
  try {
    const provider = getMessagingProvider();
    const webhook = readWebhookConfig();
    const auth = provider.checkAuthorization
      ? await provider.checkAuthorization()
      : { authorized: false, reason: 'Active provider cannot verify authorization.' };

    res.json({
      ...getMessagingStatus(),
      // Live, per-capability report for the settings screen.
      capabilities: {
        sendMessage: 'SUPPORTED',
        receiveWebhook: provider.supportsInbound === true ? 'SUPPORTED' : 'NOT_SUPPORTED',
        threadIdentification: provider.supportsInbound === true ? 'SUPPORTED' : 'NOT_SUPPORTED',
        proactiveColdOutreach: 'NOT_SUPPORTED_BY_META',
      },
      account: {
        status: provider.isConfigured ? 'CONFIGURED' : 'NOT_CONNECTED',
        authorized: auth.authorized,
        reason: auth.reason,
      },
      webhook: {
        status: provider.supportsInbound === true && isWebhookConfigured(webhook) ? 'ACTIVE' : 'INACTIVE',
        configured: isWebhookConfigured(webhook),
        path: '/api/webhooks/instagram',
      },
      prerequisites: [
        { item: 'Instagram Professional account', status: 'REQUIRES_BUSINESS_OR_PROFESSIONAL_ACCOUNT' },
        { item: 'Facebook Page linked to the Instagram account', status: 'REQUIRES_META_APP_CONFIGURATION' },
        { item: 'Meta app with Messenger > Instagram Messaging', status: 'REQUIRES_META_APP_CONFIGURATION' },
        { item: 'instagram_manage_messages permission', status: 'REQUIRES_META_APP_CONFIGURATION' },
        { item: 'Webhook callback URL registered in Meta', status: 'REQUIRES_USER_ACTION' },
        { item: 'App Review / Advanced Access for non-role recipients', status: 'REQUIRES_USER_ACTION' },
      ],
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to read messaging status' });
  }
});
