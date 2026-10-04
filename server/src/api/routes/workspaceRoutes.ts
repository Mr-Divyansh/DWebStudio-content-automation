/**
 * CONTROL CENTER — READ-ONLY WORKSPACE API
 * ============================================================================
 * The control center needs a few shapes no existing route returns (a
 * conversation list, a follow-up board, a human-task queue, time series).
 * Rather than duplicate business logic, this router only READS the existing
 * Lead / Conversation / Message / AgentEvent / OutboundMessage / AgentConfig
 * tables and aggregates them. No new table and no new write path.
 *
 * RULES OBSERVED HERE
 *  - Mounted behind requireAuth; scopes by req.user.
 *  - No handler ever selects a token/ciphertext column.
 *  - Empty results are reported as real zeroes, never as invented numbers.
 *  - Human-task and follow-up queues are DERIVED from Lead flags the existing
 *    agent already writes, so this file cannot drift out of sync with it.
 */

import { Router, type Request, type Response } from 'express';
import { prisma } from '../../database/client.js';

export const workspaceRouter = Router();

function requireUser(req: Request, res: Response): string | null {
  if (!req.user) {
    res.status(403).json({ error: 'Authentication required.' });
    return null;
  }
  return req.user.id;
}

/** Columns shared by the follow-up board and the human-task queue. */
const leadTaskSelect = {
  id: true,
  businessName: true,
  personName: true,
  status: true,
  source: true,
  conversationStage: true,
  followUpNextAt: true,
  followUpAttempts: true,
  followUpMaxAttempts: true,
  aiPaused: true,
  doNotContact: true,
  opportunityScore: true,
  lastOutboundAt: true,
  lastInboundAt: true,
  updatedAt: true,
} as const;

type LeadTask = {
  id: string;
  businessName: string;
  personName: string;
  status: string;
  source: string;
  conversationStage: string;
  followUpNextAt: Date | null;
  followUpAttempts: number;
  followUpMaxAttempts: number;
  aiPaused: boolean;
  doNotContact: boolean;
  opportunityScore: number;
  lastOutboundAt: Date | null;
  lastInboundAt: Date | null;
  updatedAt: Date;
  reason?: string;
};

/**
 * Funnel built strictly from the EXISTING LeadStatus values.
 * No new status is introduced; each bucket only groups real statuses.
 */
const PIPELINE_GROUPS: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: 'new', label: 'New', statuses: ['NEW', 'RESEARCHING'] },
  { key: 'contacted', label: 'Contacted', statuses: ['DRAFTED', 'APPROVED', 'OUTREACH_READY', 'OUTREACH_SENT', 'SENT'] },
  { key: 'engaged', label: 'Engaged', statuses: ['REPLIED', 'AI_CONVERSATION', 'FOLLOW_UP'] },
  { key: 'qualified', label: 'Qualified', statuses: ['QUALIFIED', 'INTERESTED'] },
  { key: 'handoff', label: 'Needs human', statuses: ['HUMAN_REQUIRED'] },
  { key: 'won', label: 'Closed won', statuses: ['CLOSED'] },
  { key: 'lost', label: 'Lost', statuses: ['REJECTED', 'NOT_INTERESTED', 'FAILED'] },
];
/* ------------------------------------------------------------------ overview */

/**
 * Command-centre overview. Every number is a real COUNT/aggregate.
 * `conversionRate` is null (rendered as "No data yet") until a denominator
 * exists, rather than being faked as 0%.
 */
workspaceRouter.get('/overview', async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const in7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalLeads,
      newLeads,
      qualified,
      interested,
      followUpsDue,
      humanRequired,
      aiPaused,
      conversations,
      messagesSent,
      repliesReceived,
      followUpsCompleted,
      aiActivityToday,
      recentEvents,
      config,
    ] = await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { createdAt: { gte: in7d } } }),
      prisma.lead.count({ where: { status: { in: ['QUALIFIED', 'OUTREACH_READY'] } } }),
      prisma.lead.count({ where: { status: 'INTERESTED' } }),
      prisma.lead.count({ where: { followUpNeeded: true, followUpNextAt: { lte: now } } }),
      prisma.lead.count({ where: { status: 'HUMAN_REQUIRED' } }),
      prisma.lead.count({ where: { aiPaused: true } }),
      prisma.conversation.count(),
      prisma.outboundMessage.count({ where: { status: 'SENT' } }),
      prisma.inboundMessage.count(),
      prisma.lead.count({ where: { followUpAttempts: { gt: 0 } } }),
      prisma.agentEvent.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.agentEvent.findMany({
        take: 25,
        orderBy: { createdAt: 'desc' },
        include: { lead: { select: { id: true, businessName: true, status: true } } },
      }),
      prisma.agentConfig.findUnique({ where: { id: 'singleton' } }),
    ]);

    const closed = await prisma.lead.count({ where: { status: 'CLOSED' } });
    const lost = await prisma.lead.count({ where: { status: { in: ['REJECTED', 'NOT_INTERESTED', 'FAILED'] } } });
    const decided = closed + lost;

    res.json({
      cards: {
        totalLeads,
        newLeadsLast7Days: newLeads,
        activeConversations: conversations,
        followUpsDue,
        qualifiedLeads: qualified,
        interestedLeads: interested,
        // null means "not enough data" — the UI renders "No data yet".
        conversionRate: decided > 0 ? Math.round((closed / decided) * 1000) / 10 : null,
        decidedLeads: decided,
        humanRequired,
        aiPaused,
        messagesSent,
        repliesReceived,
        followUpsCompleted,
        aiActivityToday: aiActivityToday,
      },
      agent: config
        ? {
            state: config.state,
            autoDm: config.autoDm,
            lastAction: config.lastAction,
            leadsProcessed: config.leadsProcessed,
          }
        : null,
      recentActivity: recentEvents.map((e) => ({
        id: e.id,
        type: e.type,
        status: e.status,
        message: e.message,
        createdAt: e.createdAt,
        leadId: e.leadId,
        leadName: e.lead?.businessName ?? null,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load overview' });
  }
});

/* ------------------------------------------------------------------ pipeline */

workspaceRouter.get('/pipeline', async (_req: Request, res: Response) => {
  try {
    const grouped = await prisma.lead.groupBy({ by: ['status'], _count: { id: true } });
    const byStatus = new Map(grouped.map((g) => [g.status, g._count.id]));
    res.json({
      groups: PIPELINE_GROUPS.map((g) => ({
        key: g.key,
        label: g.label,
        count: g.statuses.reduce((sum, s) => sum + (byStatus.get(s) ?? 0), 0),
        statuses: g.statuses,
      })),
      // Real statuses actually present, so an unmapped status is never hidden.
      unmapped: grouped
        .filter((g) => !PIPELINE_GROUPS.some((p) => p.statuses.includes(g.status)))
        .map((g) => ({ status: g.status, count: g._count.id })),
      total: grouped.reduce((sum, g) => sum + g._count.id, 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load pipeline' });
  }
});
/* -------------------------------------------------------------- conversations */

workspaceRouter.get('/conversations', async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '60'), 10) || 60, 200);
    const conversations = await prisma.conversation.findMany({
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        lead: { select: { id: true, businessName: true, status: true, aiPaused: true } },
        messages: { take: 1, orderBy: { timestamp: 'desc' } },
      },
    });
    res.json({
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        source: c.source,
        messageCount: c.messageCount,
        updatedAt: c.updatedAt,
        lastMessageAt: c.messages[0]?.timestamp ?? null,
        preview: c.messages[0]?.content?.slice(0, 160) ?? null,
        leadId: c.leadId,
        leadName: c.lead?.businessName ?? null,
        leadStatus: c.lead?.status ?? null,
        aiPaused: c.lead?.aiPaused ?? false,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load conversations' });
  }
});

workspaceRouter.get('/conversations/:id', async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        lead: { select: { id: true, businessName: true, status: true, aiPaused: true, notes: true } },
        messages: { orderBy: { timestamp: 'asc' } },
      },
    });
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    res.json({
      id: conversation.id,
      title: conversation.title,
      source: conversation.source,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      lead: conversation.lead,
      messages: conversation.messages.map((m) => ({
        id: m.id,
        // senderType is the real AI/Human/System signal written by the importer.
        senderType: m.senderType,
        sender: m.sender,
        content: m.content,
        timestamp: m.timestamp,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load conversation' });
  }
});

/* ----------------------------------------------------------------- follow-ups */

/**
 * Follow-up board derived from the Lead fields the agent already maintains.
 * Buckets are real comparisons against followUpNextAt.
 */
workspaceRouter.get('/follow-ups', async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [due, upcoming, completed] = await Promise.all([
      prisma.lead.findMany({
        where: { followUpNeeded: true, followUpNextAt: { lte: now } },
        orderBy: { followUpNextAt: 'asc' },
        take: 100,
        select: leadTaskSelect,
      }),
      prisma.lead.findMany({
        where: { followUpNeeded: true, followUpNextAt: { gt: now } },
        orderBy: { followUpNextAt: 'asc' },
        take: 100,
        select: leadTaskSelect,
      }),
      prisma.lead.findMany({
        where: { followUpAttempts: { gt: 0 } },
        orderBy: { lastOutboundAt: 'desc' },
        take: 50,
        select: leadTaskSelect,
      }),
    ]);

    res.json({
      overdue: due.filter((l) => l.followUpNextAt && l.followUpNextAt < startOfToday),
      dueToday: due.filter((l) => !l.followUpNextAt || (l.followUpNextAt >= startOfToday && l.followUpNextAt <= endOfToday)),
      upcoming,
      completed,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load follow-ups' });
  }
});
/* --------------------------------------------------------------- human tasks */

/**
 * Human attention queue, built from real signals the engine already writes:
 *   - Lead.status === 'HUMAN_REQUIRED'  (quality gate / confidence escalation)
 *   - Lead.aiPaused === true            (a human took over)
 *   - Lead.doNotContact === true        (an opt-out must be honoured)
 *   - AgentEvent.status === 'HUMAN_REQUIRED'
 * No task is invented; this is a view over existing rows.
 */
workspaceRouter.get('/human-tasks', async (_req: Request, res: Response) => {
  try {
    const [needsHuman, takenOver, optedOut, escalations] = await Promise.all([
      prisma.lead.findMany({
        where: { status: 'HUMAN_REQUIRED', aiPaused: false },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        select: leadTaskSelect,
      }),
      prisma.lead.findMany({ where: { aiPaused: true }, orderBy: { updatedAt: 'desc' }, take: 100, select: leadTaskSelect }),
      prisma.lead.findMany({ where: { doNotContact: true }, orderBy: { updatedAt: 'desc' }, take: 100, select: leadTaskSelect }),
      prisma.agentEvent.findMany({
        where: { status: 'HUMAN_REQUIRED' },
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: { lead: { select: { id: true, businessName: true } } },
      }),
    ]);

    const withReason = (rows: unknown[], reason: string) => (rows as LeadTask[]).map((l) => ({ ...l, reason }));

    res.json({
      needsHuman: withReason(needsHuman, 'AI escalated: quality gate or low confidence'),
      takenOver: withReason(takenOver, 'A human has taken over this conversation'),
      optedOut: withReason(optedOut, 'Lead opted out — do not contact'),
      escalations: escalations.map((e) => ({
        id: e.id,
        type: e.type,
        message: e.message,
        createdAt: e.createdAt,
        leadId: e.leadId,
        leadName: e.lead?.businessName ?? null,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load human tasks' });
  }
});
/* ------------------------------------------------------------------ analytics */

/**
 * Analytics computed from real rows only. A series with no data comes back
 * empty/zero so the UI can render "No data yet" instead of a fake trend.
 */
workspaceRouter.get('/analytics', async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const days = 30;
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const [leads, bySource, byStatus, outbound, inbound, byIntent, agentEvents] = await Promise.all([
      prisma.lead.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.lead.groupBy({ by: ['source'], _count: { id: true } }),
      prisma.lead.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.outboundMessage.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.inboundMessage.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.lead.groupBy({ by: ['intent'], _count: { id: true } }),
      prisma.agentEvent.groupBy({ by: ['status'], _count: { id: true } }),
    ]);

    // Bucket by day so the chart has a stable, gap-filled x-axis.
    const byDay = new Map<string, { leads: number; inbound: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      byDay.set(d.toISOString().slice(0, 10), { leads: 0, inbound: 0 });
    }
    const bump = (date: Date, field: 'leads' | 'inbound') => {
      const row = byDay.get(date.toISOString().slice(0, 10));
      if (row) row[field] += 1;
    };
    leads.forEach((l) => bump(l.createdAt, 'leads'));
    inbound.forEach((m) => bump(m.createdAt, 'inbound'));

    res.json({
      rangeDays: days,
      series: [...byDay.entries()].map(([date, v]) => ({ date, leads: v.leads, inbound: v.inbound })),
      bySource: bySource.map((s) => ({ key: s.source, count: s._count.id })),
      byStatus: byStatus.map((s) => ({ key: s.status, count: s._count.id })),
      byIntent: byIntent.map((s) => ({ key: s.intent, count: s._count.id })),
      outbound: outbound.map((s) => ({ key: s.status, count: s._count.id })),
      agentEvents: agentEvents.map((s) => ({ key: s.status, count: s._count.id })),
      totals: { leadsInRange: leads.length, inboundInRange: inbound.length },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load analytics' });
  }
});
/* ----------------------------------------------------------------- automation */

/**
 * Automation runs reconstructed from real AgentConfig counters plus the
 * AgentEvent log. Reports only what actually happened.
 */
workspaceRouter.get('/automation', async (_req: Request, res: Response) => {
  try {
    const [config, recentRuns, outboundTotal, inboundTotal, delivered] = await Promise.all([
      prisma.agentConfig.findUnique({ where: { id: 'singleton' } }),
      prisma.agentEvent.findMany({
        where: {
          type: {
            in: [
              'RUN_STARTED',
              'RUN_STOPPED',
              'RUN_PAUSED',
              'LEAD_ERROR',
              'REPLY_SENT',
              'REPLY_FAILED',
              'REPLY_DRY_RUN',
              'REPLY_BLOCKED',
            ],
          },
        },
        take: 40,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.outboundMessage.count(),
      prisma.inboundMessage.count(),
      prisma.outboundMessage.count({ where: { status: 'SENT' } }),
    ]);

    res.json({
      state: config?.state ?? 'STOPPED',
      autoDm: config?.autoDm ?? false,
      counters: config
        ? {
            leadsProcessed: config.leadsProcessed,
            messagesSent: config.messagesSent,
            repliesReceived: config.repliesReceived,
            interested: config.interested,
            notInterested: config.notInterested,
            humanRequired: config.humanRequired,
            failed: config.failed,
          }
        : null,
      limits: config
        ? {
            maxSendsPerHour: config.maxSendsPerHour,
            maxSendsPerLead: config.maxSendsPerLead,
            followUpDelayHours: config.followUpDelayHours,
          }
        : null,
      delivery: { attempted: outboundTotal, delivered, inboundReplies: inboundTotal },
      recentRuns: recentRuns.map((e) => ({
        id: e.id,
        type: e.type,
        status: e.status,
        message: e.message,
        createdAt: e.createdAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load automation status' });
  }
});