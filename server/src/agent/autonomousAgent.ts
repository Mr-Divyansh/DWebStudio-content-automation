/**
 * AUTONOMOUS AGENT — Orchestrator
 * ============================================================================
 * Turns the existing human-triggered pipeline into a controllable autonomous
 * loop WITHOUT duplicating any of it:
 *
 *   ResearchService.researchLead()        (P1 public research + P2 audit)
 *   QualificationService.qualifyLead()    (P3 deterministic rules)
 *   LeadService.generateOutreachDraft()   (existing AI drafting)
 *   ConversationAnalyzer.analyze...()     (existing reply analysis)
 *   LearningEngine / AgentLearningStore   (existing + structured learning)
 *
 * The loop is a single in-process interval. It is START/PAUSE/STOP controlled,
 * processes a small batch per tick, and every step is individually guarded.
 *
 * Hard guarantees:
 *  - One failing lead never stops the run; it is logged and counted as FAILED.
 *  - No lead is contacted unless the deterministic safety gates allow it.
 *  - With no provider connected, every send is logged as DRY_RUN.
 *  - Private Instagram message text is NEVER written to agent events or logs.
 */

import { prisma } from '../database/client.js';
import { LeadRepository } from '../database/repositories/leadRepository.js';
import { ResearchService } from '../services/researchService.js';
import { QualificationService } from '../services/qualificationService.js';
import { LeadService } from '../services/leadService.js';
import { getMessagingStatus } from './messagingProvider.js';
import { checkLeadMessagingAllowed, HUMAN_REQUIRED } from './safety.js';
import { AgentLearningStore } from './learningStore.js';
import { isGeminiConfigured } from '../ai/gemini.js';

const SINGLETON_ID = 'singleton';

/** Lead statuses the agent owns. Unknown values fall back to explicit mapping. */
export const AGENT_STATUSES = {
  RESEARCHING: 'RESEARCHING',
  QUALIFIED: 'QUALIFIED',
  OUTREACH_READY: 'OUTREACH_READY',
  OUTREACH_SENT: 'OUTREACH_SENT',
  AI_CONVERSATION: 'AI_CONVERSATION',
  INTERESTED: 'INTERESTED',
  NOT_INTERESTED: 'NOT_INTERESTED',
  PERSONAL_WORK: 'PERSONAL_WORK',
  NO_RESPONSE: 'NO_RESPONSE',
  FOLLOW_UP: 'FOLLOW_UP',
  HUMAN_REQUIRED: HUMAN_REQUIRED,
  CLOSED: 'CLOSED',
  FAILED: 'FAILED',
} as const;

export type AgentState = 'STOPPED' | 'RUNNING' | 'PAUSED';

export interface AgentStatus {
  state: AgentState;
  autoDm: boolean;
  messaging: ReturnType<typeof getMessagingStatus>;
  geminiConfigured: boolean;
  config: {
    maxSendsPerHour: number;
    maxSendsPerLead: number;
    followUpDelayHours: number;
    tickIntervalMs: number;
    batchSize: number;
    discoveryEnabled: boolean;
    discoveryCity: string | null;
    discoveryNiches: string[];
    discoveryLimit: number;
  };
  counters: {
    leadsProcessed: number;
    messagesSent: number;
    repliesReceived: number;
    interested: number;
    notInterested: number;
    personalWork: number;
    humanRequired: number;
    failed: number;
    noResponse: number;
    closed: number;
  };
  currentTask: string | null;
  lastAction: string | null;
  nextAction: string | null;
  startedAt: string | null;
  updatedAt: string;
}

export interface TickReport {
  processed: number;
  researched: number;
  qualified: number;
  drafted: number;
  sent: number;
  dryRun: number;
  blocked: number;
  escalated: number;
  failed: number;
  messages: string[];
}

let timer: NodeJS.Timeout | null = null;
let ticking = false;

const DISCOVERY_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function discoverPublicLeads(config: any): Promise<number> {
  if (!config.discoveryEnabled || !isGeminiConfigured()) return 0;
  const city = String(config.discoveryCity || '').trim();
  const niches = parseStringArray(config.discoveryNiches);
  if (!city || niches.length === 0) return 0;
  const key = `${city.toLowerCase()}|${niches.map((n) => n.toLowerCase()).sort().join(',')}`;
  const lastAt = config.lastDiscoveryAt?.getTime?.() ?? 0;
  const lastKey = String(config.lastDiscoveryKey || '');
  if (key === lastKey && Date.now() - lastAt < DISCOVERY_INTERVAL_MS) return 0;
  await prisma.agentConfig.update({ where: { id: SINGLETON_ID }, data: { lastDiscoveryAt: new Date(), lastDiscoveryKey: key } });
  const { PublicDiscoveryService } = await import('../services/publicDiscoveryService.js');
  const result = await PublicDiscoveryService.discover({
    city: config.discoveryCity || '',
    niches: parseStringArray(config.discoveryNiches),
    limit: config.discoveryLimit,
  });
  await logEvent({
    type: 'PUBLIC_DISCOVERY_COMPLETED',
    message: `Public discovery created ${result.created} evidence-backed lead candidate(s); ${result.skipped} skipped.`,
    status: 'SUCCESS',
    details: { created: result.created, skipped: result.skipped, warnings: result.warnings.length },
  });
  return result.created;
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function getConfig() {
  const existing = await prisma.agentConfig.findUnique({ where: { id: SINGLETON_ID } });
  if (existing) return existing;
  return prisma.agentConfig.create({
    data: {
      id: SINGLETON_ID,
      discoveryEnabled: process.env.PUBLIC_DISCOVERY_ENABLED === 'true',
      discoveryCity: (process.env.PUBLIC_DISCOVERY_CITY ?? '').trim() || null,
      discoveryNiches: process.env.PUBLIC_DISCOVERY_NICHES?.trim() || '[]',
      discoveryLimit: Math.max(1, Math.min(10, Number(process.env.PUBLIC_DISCOVERY_LIMIT ?? 3) || 3)),
    },
  });
}

async function logEvent(input: {
  type: string;
  message: string;
  status?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'HUMAN_REQUIRED';
  leadId?: string | null;
  details?: Record<string, unknown>;
}) {
  await prisma.agentEvent.create({
    data: {
      type: input.type,
      message: input.message,
      status: input.status ?? 'INFO',
      leadId: input.leadId ?? null,
      // Details are counts/ids only. Never message content.
      details: input.details ? JSON.stringify(input.details) : null,
    },
  });
}

async function increment(fields: Record<string, number>) {
  const data: Record<string, number> = {};
  for (const [key, value] of Object.entries(fields)) data[key] = value;
  await prisma.agentConfig.update({ where: { id: SINGLETON_ID }, data });
}

/**
 * The per-lead pipeline. Order matches the requested flow:
 *   research -> qualify -> select -> draft -> (gated) send -> record learning
 * Every branch is wrapped so a throw is logged and counted, never fatal.
 */
async function processLead(lead: any, config: any, report: TickReport): Promise<void> {
  const gate = checkLeadMessagingAllowed(lead);
  if (!gate.allowed && gate.code === 'OPT_OUT') {
    await logEvent({ type: 'SKIPPED_OPT_OUT', message: 'Lead skipped: opted out / do not contact.', leadId: lead.id });
    return;
  }

  // ---- 1. RESEARCH (reuses Phase 1 + P2; cached when already present) ------
  if (!lead.researchRecords?.length && lead.website && lead.website !== 'UNKNOWN') {
    await LeadRepository.update(lead.id, { status: AGENT_STATUSES.RESEARCHING });
    const research = await ResearchService.researchLead(lead.id, { useAi: isGeminiConfigured() });
    report.researched++;
    if (research.status === 'FAILED' || research.status === 'URL_REJECTED') {
      await logEvent({
        type: 'RESEARCH_FAILED',
        message: `Research failed (${research.status}). Manual verification needed.`,
        status: 'HUMAN_REQUIRED',
        leadId: lead.id,
        details: { status: research.status, errors: research.errors.length },
      });
      await LeadRepository.update(lead.id, { status: AGENT_STATUSES.HUMAN_REQUIRED });
      await increment({ humanRequired: 1, failed: 1 });
      report.escalated++;
      report.failed++;
      return;
    }
    await logEvent({
      type: 'RESEARCH_COMPLETED',
      message: `Public research completed (${research.status}).`,
      status: 'SUCCESS',
      leadId: lead.id,
      details: { evidenceCount: research.evidence.length, aiUsed: research.isAiGenerated },
    });
  }

  // ---- 2. QUALIFY (deterministic P3 engine) --------------------------------
  const qualification = await QualificationService.qualifyLead(lead.id, {});
  report.qualified++;

  if (qualification.status === 'NEEDS_REVIEW') {
    await logEvent({
      type: 'QUALIFICATION_NEEDS_REVIEW',
      message: 'Qualification needs human review.',
      status: 'HUMAN_REQUIRED',
      leadId: lead.id,
      details: { confidence: qualification.confidence, reasons: qualification.reasons.length },
    });
    await LeadRepository.update(lead.id, { status: AGENT_STATUSES.HUMAN_REQUIRED });
    await increment({ humanRequired: 1 });
    report.escalated++;
    return;
  }

  if (qualification.status === 'NOT_QUALIFIED') {
    await LeadRepository.update(lead.id, {
      status: AGENT_STATUSES.NOT_INTERESTED,
      suggestedNextAction: qualification.nextAction,
    });
    await increment({ notInterested: 1 });
    await AgentLearningStore.record({
      leadId: lead.id,
      sourceType: 'AUTONOMOUS_RUN',
      sourceId: qualification.id ?? null,
      category: 'QUALIFICATION',
      observation: `Lead did not qualify: ${qualification.reasons.map((r) => r.ruleId).join(', ') || 'no matching rule'}`,
      outcome: 'NOT_QUALIFIED',
    });
    return;
  }

  // ---- 3. SELECT + DRAFT (existing AI drafting path) -----------------------
  const latestDraft = await prisma.outreachDraft.findFirst({
    where: { leadId: lead.id },
    orderBy: { createdAt: 'desc' },
  });

  let draft = latestDraft;
  if (!latestDraft) {
    const result = await LeadService.generateOutreachDraft(lead.id);
    draft = result.draft;
    report.drafted++;
    await logEvent({
      type: 'DRAFT_CREATED',
      message: 'Personalized outreach draft generated from verified evidence.',
      status: 'SUCCESS',
      leadId: lead.id,
      details: { draftId: result.draft?.id ?? null, channel: result.draft?.channel ?? null, aiGenerated: result.isAiGenerated },
    });
  }

  if (!draft) {
    // No draft could be produced (e.g. no verified evidence). Never invent one.
    await logEvent({
      type: 'DRAFT_UNAVAILABLE',
      message: 'No outreach draft could be produced from verified evidence.',
      status: 'HUMAN_REQUIRED',
      leadId: lead.id,
    });
    await LeadRepository.update(lead.id, { status: AGENT_STATUSES.HUMAN_REQUIRED });
    await increment({ humanRequired: 1 });
    report.escalated++;
    return;
  }

  // ---- 4. HUMAN-REVIEWED OUTREACH ------------------------------------------
  // Researched/cold leads are never passed to a provider. Meta's official API
  // cannot initiate a conversation with an arbitrary IGSID, and a handle is not
  // an IGSID. The evidence-backed draft remains available for operator review.
  await LeadRepository.update(lead.id, {
    status: AGENT_STATUSES.OUTREACH_READY,
    conversationStage: 'QUALIFYING',
    followUpNeeded: false,
    followUpNextAt: null,
    suggestedNextAction: 'Human operator must review the evidence-backed draft before any outreach.',
    lastAgentActionAt: new Date(),
  });
  await logEvent({
    type: 'OUTREACH_READY',
    message: "Evidence-backed outreach draft prepared. No message was sent; researched/cold leads cannot be cold-DM'd.",
    status: 'HUMAN_REQUIRED',
    leadId: lead.id,
    details: { draftId: draft.id, channel: draft.channel },
  });
  report.dryRun++;
  return;
}


/* ------------------------------------------------------------------ control */

function clearTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export class AutonomousAgent {
  static async getStatus(): Promise<AgentStatus> {
    const config = await getConfig();
    return {
      state: config.state as AgentState,
      autoDm: config.autoDm,
      messaging: getMessagingStatus(),
      geminiConfigured: isGeminiConfigured(),
      config: {
        maxSendsPerHour: config.maxSendsPerHour,
        maxSendsPerLead: config.maxSendsPerLead,
        followUpDelayHours: config.followUpDelayHours,
        tickIntervalMs: config.tickIntervalMs,
        batchSize: config.batchSize,
        discoveryEnabled: config.discoveryEnabled,
        discoveryCity: config.discoveryCity,
        discoveryNiches: parseStringArray(config.discoveryNiches),
        discoveryLimit: config.discoveryLimit,
      },
      counters: {
        leadsProcessed: config.leadsProcessed,
        messagesSent: config.messagesSent,
        repliesReceived: config.repliesReceived,
        interested: config.interested,
        notInterested: config.notInterested,
        personalWork: config.personalWork,
        humanRequired: config.humanRequired,
        failed: config.failed,
        noResponse: config.noResponse,
        closed: config.closed,
      },
      currentTask: config.currentTask,
      lastAction: config.lastAction,
      nextAction: config.nextAction,
      startedAt: config.startedAt?.toISOString() ?? null,
      updatedAt: config.updatedAt.toISOString(),
    };
  }

  /**
   * The single ON/OFF switch the owner needs.
   *
   *  ON  -> starts the run loop and enables AUTO DM only when an authorized
   *         provider adapter is actually registered. Without one the AI runs in
   *         DRAFT-ONLY mode: it researches, qualifies and drafts, but nothing can
   *         be delivered because every send is refused by the safety gates.
   *  OFF -> clears the timer, disables AUTO DM and stops the loop.
   *
   * START / PAUSE / STOP stay available for finer control; they are not removed.
   */
  static async setEnabled(enabled: boolean): Promise<AgentStatus> {
    const config = await getConfig();

    if (enabled) {
      const providerConfigured = getMessagingStatus().configured;
      if (config.autoDm !== providerConfigured) {
        await prisma.agentConfig.update({
          where: { id: SINGLETON_ID },
          data: { autoDm: providerConfigured },
        });
      }
      await logEvent({
        type: 'AI_ENABLED',
        message: providerConfigured
          ? 'AI switched ON with AUTO DM enabled for authorized conversations.'
          : 'AI switched ON in draft-only mode: no authorized messaging provider is connected, so nothing can be delivered.',
        status: providerConfigured ? 'SUCCESS' : 'WARNING',
      });
      return this.start();
    }

    if (config.autoDm) {
      await prisma.agentConfig.update({ where: { id: SINGLETON_ID }, data: { autoDm: false } });
    }
    await logEvent({
      type: 'AI_DISABLED',
      message: 'AI switched OFF. AUTO DM disabled and the run loop stopped.',
      status: 'INFO',
    });
    return this.stop();
  }

  static async setAutoDm(enabled: boolean) {
    await getConfig();
    await prisma.agentConfig.update({ where: { id: SINGLETON_ID }, data: { autoDm: enabled } });
    await logEvent({
      type: 'AUTO_DM_CHANGED',
      message: enabled ? 'AUTO DM enabled by operator.' : 'AUTO DM disabled by operator.',
      status: enabled ? 'WARNING' : 'INFO',
    });
    return this.getStatus();
  }

  static async configureDiscovery(input: {
    enabled: boolean;
    city: string;
    niches: string[];
    limit?: number;
  }): Promise<AgentStatus> {
    await getConfig();
    const city = input.city.trim();
    const niches = Array.from(new Set(input.niches.map((n) => n.trim()).filter(Boolean))).slice(0, 12);
    if (input.enabled && !city) throw new Error('A discovery city is required when discovery is enabled.');
    if (input.enabled && niches.length === 0) throw new Error('At least one target niche is required.');
    const limit = Math.max(1, Math.min(10, input.limit ?? 3));
    await prisma.agentConfig.update({
      where: { id: SINGLETON_ID },
      data: {
        discoveryEnabled: input.enabled,
        discoveryCity: city || null,
        discoveryNiches: JSON.stringify(niches),
        discoveryLimit: limit,
        lastDiscoveryAt: null,
        lastDiscoveryKey: '',
      },
    });
    await logEvent({
      type: 'DISCOVERY_CONFIGURED',
      message: input.enabled
        ? `Public discovery enabled for ${limit} candidate(s) per tick.`
        : 'Public discovery disabled.',
      status: input.enabled ? 'SUCCESS' : 'INFO',
    });
    return this.getStatus();
  }

  static async start(): Promise<AgentStatus> {
    const config = await getConfig();
    if (config.state === 'RUNNING') return this.getStatus();

    await prisma.agentConfig.update({
      where: { id: SINGLETON_ID },
      data: { state: 'RUNNING', startedAt: config.startedAt ?? new Date(), pausedAt: null, currentTask: 'Starting run loop' },
    });
    await logEvent({
      type: 'RUN_STARTED',
      message: `Autonomous agent started. AUTO DM is ${config.autoDm ? 'ON' : 'OFF'}.`,
      status: 'SUCCESS',
    });

    clearTimer();
    const interval = Math.max(5000, config.tickIntervalMs);
    timer = setInterval(() => {
      void this.tick().catch((err) => {
        console.error('[AutonomousAgent] tick failed:', err?.message);
      });
    }, interval);
    // Never keep the process alive just for the agent loop.
    timer.unref?.();

    return this.getStatus();
  }

  static async pause(): Promise<AgentStatus> {
    clearTimer();
    await getConfig();
    await prisma.agentConfig.update({
      where: { id: SINGLETON_ID },
      data: { state: 'PAUSED', pausedAt: new Date(), currentTask: null, nextAction: 'Paused by operator' },
    });
    await logEvent({ type: 'RUN_PAUSED', message: 'Autonomous agent paused by operator.', status: 'WARNING' });
    return this.getStatus();
  }

  static async stop(): Promise<AgentStatus> {
    clearTimer();
    await getConfig();
    await prisma.agentConfig.update({
      where: { id: SINGLETON_ID },
      data: { state: 'STOPPED', stoppedAt: new Date(), currentTask: null, nextAction: 'Stopped by operator' },
    });
    await logEvent({ type: 'RUN_STOPPED', message: 'Autonomous agent stopped by operator.', status: 'INFO' });
    return this.getStatus();
  }

  /** Human take-over: the AI must not message this lead until released. */
  static async takeOver(leadId: string) {
    await LeadRepository.update(leadId, {
      aiPaused: true,
      status: AGENT_STATUSES.HUMAN_REQUIRED,
      followUpNeeded: false,
      followUpNextAt: null,
    });
    await logEvent({
      type: 'HUMAN_TAKEOVER',
      message: 'Human took over this conversation. AI messaging suspended for this lead.',
      status: 'HUMAN_REQUIRED',
      leadId,
    });
    return LeadRepository.findById(leadId);
  }

  /** Release: autonomous handling may resume for this lead. */
  static async release(leadId: string) {
    await LeadRepository.update(leadId, { aiPaused: false });
    await logEvent({ type: 'HUMAN_RELEASE', message: 'Human released the conversation. AI may resume.', leadId });
    return LeadRepository.findById(leadId);
  }

  /** Records an opt-out and permanently blocks the AI for that lead. */
  static async optOut(leadId: string) {
    await LeadRepository.update(leadId, {
      doNotContact: true,
      optOutAt: new Date(),
      aiPaused: true,
      followUpNeeded: false,
      followUpNextAt: null,
    });
    await logEvent({
      type: 'OPT_OUT',
      message: 'Lead opted out. AI contact permanently disabled for this lead.',
      status: 'HUMAN_REQUIRED',
      leadId,
    });
    return LeadRepository.findById(leadId);
  }

  /**
   * Candidate selection. Only leads the AI is allowed to work on are returned:
   * no opt-outs, no human take-over, and only statuses that still need action.
   */
  static async selectCandidates(batchSize: number) {
    // Only statuses that still need autonomous work are selected. OUTREACH_READY
    // and later states are human/conversation states and must not be reprocessed
    // on every tick (that would re-draft and re-log the same lead).
    return prisma.lead.findMany({
      where: {
        doNotContact: false,
        aiPaused: false,
        status: { in: ['NEW', 'RESEARCHING', 'QUALIFIED'] },
      },
      orderBy: { updatedAt: 'asc' },
      take: Math.max(1, Math.min(batchSize, 20)),
      include: {
        researchRecords: { take: 1, orderBy: { createdAt: 'desc' } },
        qualifications: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    });
  }

  /**
   * One batch of autonomous work. Safe to call manually (the /api/agent/tick
   * endpoint) which is how the loop is tested without waiting on a timer.
   */
  static async tick(): Promise<TickReport> {
    const report: TickReport = {
      processed: 0,
      researched: 0,
      qualified: 0,
      drafted: 0,
      sent: 0,
      dryRun: 0,
      blocked: 0,
      escalated: 0,
      failed: 0,
      messages: [],
    };

    if (ticking) return report;
    ticking = true;

    try {
      const config = await getConfig();
      if (config.state !== 'RUNNING') return report;

      const leads = await this.selectCandidates(config.batchSize);
      await prisma.agentConfig.update({
        where: { id: SINGLETON_ID },
        data: { currentTask: leads.length ? `Processing ${leads.length} lead(s)` : 'Scanning for eligible leads' },
      });
      await discoverPublicLeads(config).catch(async (err: any) => {
        await logEvent({
          type: 'PUBLIC_DISCOVERY_FAILED',
          message: `Public discovery failed safely: ${err?.message || 'unknown error'}`,
          status: 'ERROR',
        });
      });

      for (const lead of leads) {
        try {
          await processLead(lead, config, report);
          report.processed++;
          await increment({ leadsProcessed: 1 });
        } catch (err: any) {
          // One broken lead must never stop the run.
          report.failed++;
          await increment({ failed: 1 });
          await logEvent({
            type: 'LEAD_ERROR',
            message: `Agent step failed: ${err?.message || 'unknown error'}`,
            status: 'ERROR',
            leadId: lead.id,
          });
          await LeadRepository.update(lead.id, { status: AGENT_STATUSES.FAILED }).catch(() => {});
        }
      }

      const summary = `Processed ${report.processed}: sent=${report.sent} dryRun=${report.dryRun} blocked=${report.blocked} escalated=${report.escalated} failed=${report.failed}`;
      await prisma.agentConfig.update({
        where: { id: SINGLETON_ID },
        data: { currentTask: null, lastAction: summary, nextAction: 'Waiting for next tick' },
      });
      return report;
    } finally {
      ticking = false;
    }
  }
}
