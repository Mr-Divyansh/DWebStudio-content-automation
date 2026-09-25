/**
 * AUTONOMOUS AGENT — API
 * ============================================================================
 * Control + visibility only. There is no operator-triggered send endpoint; delivery occurs only inside the gated agent/follow-up services.
 */

import { Router } from 'express';
import { prisma } from '../../database/client.js';
import { AutonomousAgent } from '../../agent/autonomousAgent.js';
import { AgentLearningStore } from '../../agent/learningStore.js';
import { PricingService } from '../../agent/pricing.js';
import { getMessagingStatus, getMessagingProvider } from '../../agent/messagingProvider.js';
import { readWebhookConfig, isWebhookConfigured } from '../../agent/instagramWebhook.js';
import { AgentSetupService } from '../../agent/setupService.js';

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

/** AUTO DM ON/OFF. Controls only authorized replies and bounded follow-ups; never cold outreach. */
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

/* --------------------------------------- one-switch AI control + training */

/** Real readiness checklist. Exposes environment variable NAMES only, never values. */
agentRouter.get('/setup', async (_req, res) => {
  try {
    res.json(await AgentSetupService.getReport());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to read AI setup status' });
  }
});

/** Trains the AI on owner-authored portfolio + pricing knowledge (idempotent). */
agentRouter.post('/setup/train', async (_req, res) => {
  try {
    res.json(await AgentSetupService.train());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to train the AI' });
  }
});

/** One press: train when needed, then switch the AI ON. */
agentRouter.post('/setup/activate', async (_req, res) => {
  try {
    res.json(await AgentSetupService.activate());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to switch the AI on' });
  }
});

/** One press: switch the AI OFF and disable AUTO DM. */
agentRouter.post('/setup/deactivate', async (_req, res) => {
  try {
    res.json(await AgentSetupService.deactivate());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to switch the AI off' });
  }
});

/**
 * The single ON/OFF switch. ON starts the run loop and enables AUTO DM only when
 * a provider that can actually deliver is connected; OFF stops everything.
 */
agentRouter.post('/enabled', async (req, res) => {
  try {
    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }
    res.json(await AutonomousAgent.setEnabled(enabled));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to switch the AI on or off' });
  }
});

agentRouter.post('/discovery', async (req, res) => {
  try {
    const body = req.body ?? {};
    if (typeof body.enabled !== 'boolean' || typeof body.city !== 'string' || !Array.isArray(body.niches)) {
      return res.status(400).json({ error: 'enabled, city and niches are required' });
    }
    res.json(await AutonomousAgent.configureDiscovery({
      enabled: body.enabled,
      city: body.city,
      niches: body.niches.map(String),
      limit: body.limit == null ? 3 : Number(body.limit),
    }));
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to configure discovery' });
  }
});

agentRouter.post('/follow-ups/run', async (_req, res) => {
  try {
    const { FollowUpService } = await import('../../agent/followUpService.js');
    res.json(await FollowUpService.runDue(10));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Follow-up run failed' });
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
      packageName: body.packageName ? String(body.packageName) : null,
      includedItems: body.includedItems ? String(body.includedItems) : null,
      deliveryEstimate: body.deliveryEstimate ? String(body.deliveryEstimate) : null,
      advancePayment: body.advancePayment ? String(body.advancePayment) : null,
      revisions: body.revisions ? String(body.revisions) : null,
      optionalExtras: body.optionalExtras ? String(body.optionalExtras) : null,
      notes: body.notes ? String(body.notes) : null,
    });
    res.json(rule);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to save pricing rule' });
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
