/**
 * AI SETUP, TRAINING & ONE-SWITCH ACTIVATION
 * ============================================================================
 * One place that answers the only two questions the owner actually has:
 *
 *   1. "Is my AI ready?"          -> getReport()   (a real checklist, never a guess)
 *   2. "Start / stop my AI."      -> activate() / deactivate()
 *
 * HOW THE AI IS "TRAINED"
 * ----------------------------------------------------------------------------
 * This project never retrains a model. There is NO fine-tuning. "Training" means
 * converting the owner's own dashboard content - portfolio case studies and
 * pricing rules - into APPROVED knowledge rows the agent is allowed to read as
 * context. Because that content is authored by the owner, it is stored as
 * APPROVED; anything the AI *infers* still starts as PROPOSED and can only be
 * promoted by a human (see agent/learningStore.ts). Training is idempotent:
 * running it twice never duplicates a rule, and editing a project or a price in
 * the dashboard refreshes the matching rule on the next training run.
 *
 * SECRETS NEVER LEAVE THE ENVIRONMENT
 * ----------------------------------------------------------------------------
 * The report exposes environment variable NAMES and whether each one is set -
 * never a key, token, password or connection string. Keys are read from `.env`
 * (local) or the hosting provider's environment settings (production); they are
 * never accepted from, or written to, the database or an API response.
 */

import { prisma, checkDatabaseConnection } from '../database/client.js';
import { isGeminiConfigured } from '../ai/gemini.js';
import { getMessagingProvider } from './messagingProvider.js';
import { readWebhookConfig, isWebhookConfigured } from './instagramWebhook.js';
import { AutonomousAgent, type AgentStatus } from './autonomousAgent.js';

/** sourceType used for owner-authored knowledge. Never used for AI inferences. */
export const OWNER_SOURCE_TYPE = 'OWNER_CONFIG';

export type SetupCheckStatus = 'READY' | 'ACTION_REQUIRED' | 'OPTIONAL';

export interface EnvKeyStatus {
  name: string;
  set: boolean;
  required: boolean;
  purpose: string;
}

export interface SetupCheck {
  id: string;
  label: string;
  status: SetupCheckStatus;
  detail: string;
  /** Environment variable NAMES only. Values are never read into a response. */
  keys: string[];
  required: boolean;
}

export interface AiTrainingReport {
  portfolioProjects: number;
  pricingRules: number;
  created: number;
  updated: number;
  skipped: number;
  approvedRules: number;
  proposedRules: number;
  summary: string;
}

export interface AgentSetupReport {
  aiReady: boolean;
  canDraft: boolean;
  canSend: boolean;
  providerAuthorized: boolean;
  providerAuthorizationReason: string;
  checks: SetupCheck[];
  envKeys: EnvKeyStatus[];
  knowledge: {
    portfolioProjects: number;
    pricingRules: number;
    approvedRules: number;
    proposedRules: number;
    ownerRules: number;
    coveragePercent: number;
  };
  trained: {
    bootstrapped: boolean;
    lastTrainedAt: string | null;
    notes: string;
  };
}

export interface AiActivationResult {
  steps: string[];
  status: AgentStatus;
  report: AgentSetupReport;
}

/* --------------------------------------------------------------- env helpers */

function isSet(name: string): boolean {
  return Boolean((process.env[name] ?? '').trim());
}

function key(name: string, required: boolean, purpose: string): EnvKeyStatus {
  return { name, set: isSet(name), required, purpose };
}

/* ---------------------------------------------------------- knowledge helpers */

/** Collapses whitespace and hard-caps a value so a knowledge row stays readable. */
function clip(value: string | null | undefined, max: number): string {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length <= max ? clean : `${clean.slice(0, max - 3)}...`;
}

function portfolioObservation(project: {
  title: string;
  category: string;
  description: string;
  technologies: string | null;
  results: string | null;
}): string {
  const parts = [
    `Verified D Web Studio case study "${project.title}" (${project.category}): ${clip(project.description, 220)}`,
  ];
  if (clip(project.technologies, 120)) parts.push(`Built with ${clip(project.technologies, 120)}.`);
  if (clip(project.results, 160)) {
    parts.push(
      `Recorded result: ${clip(project.results, 160)}. Only these numbers may ever be mentioned; never invent a different figure.`,
    );
  } else {
    parts.push('No metric is recorded for this project, so never quote a number for it.');
  }
  return parts.join(' ');
}

function pricingObservation(rule: {
  service: string;
  currency: string;
  minPrice: number;
  normalPriceMin: number;
  normalPriceMax: number;
  maxNegotiation: number;
  escalationAbove: number | null;
  deliveryEstimate: string | null;
}): string {
  const parts = [
    `Owner-approved pricing for ${rule.service}: quote inside ${rule.currency} ${rule.normalPriceMin}-${rule.normalPriceMax}, absolute floor ${rule.currency} ${rule.minPrice}, hard negotiation floor ${rule.currency} ${rule.maxNegotiation}.`,
    `Never go below the hard floor; anything above ${rule.currency} ${rule.escalationAbove ?? rule.maxNegotiation} must be escalated to the owner instead of agreed.`,
  ];
  if (clip(rule.deliveryEstimate, 80)) parts.push(`Delivery estimate: ${clip(rule.deliveryEstimate, 80)}.`);
  return parts.join(' ');
}

type OwnerKnowledgeOutcome = 'CREATED' | 'UPDATED' | 'SKIPPED';

/**
 * Stores one owner-authored knowledge row, keyed on `sourceId` so repeated
 * training runs are idempotent. If the owner edits the source content in the
 * dashboard, the existing row is refreshed instead of duplicated.
 */
async function upsertOwnerKnowledge(input: {
  sourceId: string;
  category: 'OUTREACH_STYLE' | 'PRICING';
  observation: string;
  evidence: string[];
}): Promise<OwnerKnowledgeOutcome> {
  const existing = await prisma.learningEvent.findFirst({
    where: { sourceType: OWNER_SOURCE_TYPE, sourceId: input.sourceId },
    select: { id: true, observation: true },
  });

  if (!existing) {
    await prisma.learningEvent.create({
      data: {
        sourceType: OWNER_SOURCE_TYPE,
        sourceId: input.sourceId,
        category: input.category,
        observation: input.observation,
        // The owner wrote this content in the dashboard, so no AI inference is
        // involved and human review is already implicit.
        humanAction: 'OWNER_CONFIGURED',
        evidence: JSON.stringify(input.evidence.slice(0, 5)),
        outcome: 'OWNER_APPROVED',
        status: 'APPROVED',
        supportCount: 1,
        contradictionCount: 0,
      },
    });
    return 'CREATED';
  }

  if (existing.observation !== input.observation) {
    await prisma.learningEvent.update({
      where: { id: existing.id },
      data: {
        observation: input.observation,
        evidence: JSON.stringify(input.evidence.slice(0, 5)),
        outcome: 'OWNER_APPROVED',
        status: 'APPROVED',
      },
    });
    return 'UPDATED';
  }

  return 'SKIPPED';
}

/* ------------------------------------------------------------------- service */

export class AgentSetupService {
  /**
   * Real readiness report. Every check is measured, never assumed: the database
   * is pinged, the messaging adapter is asked to verify authorization, and the
   * knowledge base is counted.
   */
  static async getReport(): Promise<AgentSetupReport> {
    const provider = getMessagingProvider();
    const webhook = readWebhookConfig();

    const db = await checkDatabaseConnection().catch(() => ({ ok: false, error: 'Database check failed.' }));
    const portfolioProjects = await prisma.portfolioProject.count().catch(() => 0);
    const pricingRules = await prisma.pricingRule.count({ where: { active: true } }).catch(() => 0);
    const approvedRules = await prisma.learningEvent.count({ where: { status: 'APPROVED' } }).catch(() => 0);
    const proposedRules = await prisma.learningEvent.count({ where: { status: 'PROPOSED' } }).catch(() => 0);
    const ownerRows = await prisma.learningEvent
      .findMany({
        where: { sourceType: OWNER_SOURCE_TYPE, status: 'APPROVED' },
        select: { sourceId: true },
      })
      .catch(() => [] as Array<{ sourceId: string | null }>);
    const lastTraining = await prisma.agentEvent
      .findFirst({ where: { type: 'AI_TRAINED' }, orderBy: { createdAt: 'desc' } })
      .catch(() => null);
    await AutonomousAgent.getStatus().catch(() => null);

    let providerAuthorized = false;
    let providerAuthorizationReason = 'No authorized messaging provider is connected.';
    if (provider.isConfigured && provider.checkAuthorization) {
      const auth = await provider
        .checkAuthorization()
        .catch(() => ({ authorized: false, reason: 'Authorization check failed.' }));
      providerAuthorized = auth.authorized;
      providerAuthorizationReason = auth.reason;
    } else if (provider.isConfigured) {
      providerAuthorizationReason = 'The active provider cannot verify authorization, so sending stays disabled.';
    }

    const ownerEntities = portfolioProjects + pricingRules;
    const ownerRules = ownerRows.length;
    const coveragePercent = ownerEntities === 0 ? 0 : Math.min(100, Math.round((ownerRules / ownerEntities) * 100));

    const geminiReady = isGeminiConfigured();
    const databaseReady = db.ok;
    const knowledgeReady = portfolioProjects > 0;
    const trainedReady = ownerEntities > 0 && ownerRules >= ownerEntities;
    const webhookReady = isWebhookConfigured(webhook);
    const operatorLoginReady =
      (isSet('DWS_ADMIN_PASSWORD') && isSet('DWS_SESSION_SECRET')) || process.env.NODE_ENV !== 'production';
    const cronReady = isSet('CRON_SECRET');
    const coreChecks: SetupCheck[] = [
      {
        id: 'database',
        label: 'Database connected',
        status: databaseReady ? 'READY' : 'ACTION_REQUIRED',
        detail: databaseReady
          ? 'Prisma is connected and answering queries.'
          : `The database is not reachable: ${db.error ?? 'unknown error'}.`,
        keys: ['DATABASE_URL'],
        required: true,
      },
      {
        id: 'gemini',
        label: 'Gemini API key',
        status: geminiReady ? 'READY' : 'ACTION_REQUIRED',
        detail: geminiReady
          ? 'AI research, drafting and reply analysis are enabled.'
          : 'Without this key the system still runs, but only deterministic rules are used - no AI research or drafting.',
        keys: ['GEMINI_API_KEY'],
        required: true,
      },
      {
        id: 'knowledge',
        label: 'Your portfolio knowledge',
        status: knowledgeReady ? 'READY' : 'ACTION_REQUIRED',
        detail: knowledgeReady
          ? `${portfolioProjects} portfolio case study(ies) available as verified proof.`
          : 'Add at least one portfolio project so the AI has real proof instead of inventing it.',
        keys: [],
        required: true,
      },
      {
        id: 'training',
        label: 'AI trained on your knowledge',
        status: trainedReady ? 'READY' : ownerEntities === 0 ? 'ACTION_REQUIRED' : 'OPTIONAL',
        detail: trainedReady
          ? `${ownerRules} owner rule(s) approved and feeding the AI context.`
          : ownerEntities === 0
            ? 'Nothing to train on yet: add portfolio projects or pricing rules first.'
            : `${ownerRules} of ${ownerEntities} owner rule(s) trained. Press Train AI to finish.`,
        keys: [],
        required: false,
      },
    ];

    const integrationChecks: SetupCheck[] = [
      {
        id: 'pricing',
        label: 'Pricing rules',
        status: pricingRules > 0 ? 'READY' : 'OPTIONAL',
        detail: pricingRules > 0
          ? `${pricingRules} active rule(s). The AI may only quote inside them.`
          : 'Optional, but without a rule every price question escalates to you.',
        keys: [],
        required: false,
      },
      {
        id: 'messaging_provider',
        label: 'Instagram sending account',
        status: provider.isConfigured ? (providerAuthorized ? 'READY' : 'ACTION_REQUIRED') : 'OPTIONAL',
        detail: provider.isConfigured
          ? providerAuthorized
            ? `Provider ${provider.name} is connected and authorized to send.`
            : `Provider ${provider.name} is configured but not authorized: ${providerAuthorizationReason}`
          : 'Not connected. The AI can still research, qualify and draft; nothing can be delivered.',
        keys: ['META_PAGE_ACCESS_TOKEN', 'META_PAGE_ID', 'MESSAGING_PROVIDER'],
        required: false,
      },
      {
        id: 'webhook',
        label: 'Reply webhook (receive messages)',
        status: webhookReady ? 'READY' : 'OPTIONAL',
        detail: webhookReady
          ? 'Signature verification is configured, so incoming replies can be trusted.'
          : 'Not configured. Without it the AI cannot receive or answer incoming replies.',
        keys: ['META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN'],
        required: false,
      },
      {
        id: 'cron',
        label: 'Scheduled runs',
        status: cronReady ? 'READY' : 'OPTIONAL',
        detail: cronReady
          ? 'Scheduled agent ticks are authenticated.'
          : 'Optional locally. Required in production so cron can trigger the agent.',
        keys: ['CRON_SECRET'],
        required: false,
      },
    ];

    const accessChecks: SetupCheck[] = [
      {
        id: 'operator_login',
        label: 'Operator login',
        status: operatorLoginReady ? 'READY' : 'ACTION_REQUIRED',
        detail: operatorLoginReady
          ? process.env.NODE_ENV === 'production'
            ? 'Operator password protection is active.'
            : 'Not set. Required before going live; ignored for local development.'
          : 'Production requires both values or every API call is refused.',
        keys: ['DWS_ADMIN_PASSWORD', 'DWS_SESSION_SECRET'],
        required: process.env.NODE_ENV === 'production',
      },
    ];

    const isProduction = process.env.NODE_ENV === 'production';
    const checks: SetupCheck[] = [...coreChecks, ...integrationChecks, ...accessChecks];
    const envKeys: EnvKeyStatus[] = [
      key('GEMINI_API_KEY', true, 'AI research, drafting and reply analysis'),
      key('DATABASE_URL', true, 'Database connection'),
      key('DWS_ADMIN_PASSWORD', isProduction, 'Operator login'),
      key('DWS_SESSION_SECRET', isProduction, 'Operator session signing'),
      key('META_PAGE_ACCESS_TOKEN', false, 'Instagram sending'),
      key('META_PAGE_ID', false, 'Instagram sending'),
      key('MESSAGING_PROVIDER', false, "Set to 'instagram' to select the official adapter"),
      key('META_APP_SECRET', false, 'Webhook signature verification'),
      key('META_WEBHOOK_VERIFY_TOKEN', false, 'Webhook subscription handshake'),
      key('CRON_SECRET', isProduction, 'Authenticated scheduled ticks'),
    ];

    const aiReady = coreChecks
      .concat(accessChecks)
      .filter((check) => check.required)
      .every((check) => check.status === 'READY');

    return {
      aiReady,
      canDraft: geminiReady && databaseReady,
      canSend: provider.isConfigured && providerAuthorized,
      providerAuthorized,
      providerAuthorizationReason,
      checks,
      envKeys,
      knowledge: {
        portfolioProjects,
        pricingRules,
        approvedRules,
        proposedRules,
        ownerRules,
        coveragePercent,
      },
      trained: {
        bootstrapped: trainedReady,
        lastTrainedAt: lastTraining?.createdAt?.toISOString() ?? null,
        notes: trainedReady
          ? 'Training is memory-based: your portfolio and pricing rules are read as approved context. No model fine-tuning happens.'
          : 'Train AI converts your portfolio projects and pricing rules into approved knowledge the agent may use.',
      },
    };
  }

  /**
   * "Trains" the AI on owner-authored knowledge. Idempotent by design: every rule
   * is keyed on the source row it came from, so re-running refreshes changed
   * content and skips unchanged content. No model is ever fine-tuned here.
   */
  static async train(): Promise<AiTrainingReport> {
    const projects = await prisma.portfolioProject.findMany({ orderBy: { createdAt: 'asc' } });
    const rules = await prisma.pricingRule.findMany({ where: { active: true }, orderBy: { service: 'asc' } });

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const tally = (outcome: OwnerKnowledgeOutcome) => {
      if (outcome === 'CREATED') created++;
      else if (outcome === 'UPDATED') updated++;
      else skipped++;
    };

    for (const project of projects) {
      tally(
        await upsertOwnerKnowledge({
          sourceId: `portfolio:${project.id}`,
          category: 'OUTREACH_STYLE',
          observation: portfolioObservation(project),
          evidence: [`Owner portfolio entry: ${project.title}`, `Owner category: ${project.category}`],
        }),
      );
    }

    for (const rule of rules) {
      tally(
        await upsertOwnerKnowledge({
          sourceId: `pricing:${rule.service}`,
          category: 'PRICING',
          observation: pricingObservation(rule),
          evidence: [`Owner pricing rule: ${rule.service}`, `Owner currency: ${rule.currency}`],
        }),
      );
    }

    const [approvedRules, proposedRules] = await Promise.all([
      prisma.learningEvent.count({ where: { status: 'APPROVED' } }),
      prisma.learningEvent.count({ where: { status: 'PROPOSED' } }),
    ]);

    const sources = projects.length + rules.length;
    const summary =
      sources === 0
        ? 'Nothing to train on yet: add portfolio projects or pricing rules first.'
        : `Trained on ${projects.length} portfolio project(s) and ${rules.length} pricing rule(s): ${created} new, ${updated} refreshed, ${skipped} unchanged.`;

    await prisma.agentEvent.create({
      data: {
        type: 'AI_TRAINED',
        status: 'SUCCESS',
        message: summary,
        details: JSON.stringify({
          created,
          updated,
          skipped,
          portfolioProjects: projects.length,
          pricingRules: rules.length,
        }),
      },
    });

    return {
      portfolioProjects: projects.length,
      pricingRules: rules.length,
      created,
      updated,
      skipped,
      approvedRules,
      proposedRules,
      summary,
    };
  }

  /**
   * One press: train if needed, resume discovery when it is already configured,
   * then switch the AI ON. AUTO DM is enabled only when a provider that can
   * actually deliver is connected - otherwise the AI runs in draft-only mode.
   */
  static async activate(): Promise<AiActivationResult> {
    const steps: string[] = [];
    const before = await this.getReport();

    if (before.trained.bootstrapped) {
      steps.push('AI knowledge is already trained on your portfolio and pricing rules.');
    } else if (before.knowledge.portfolioProjects > 0 || before.knowledge.pricingRules > 0) {
      const training = await this.train();
      steps.push(training.summary);
    } else {
      steps.push('No portfolio projects or pricing rules found yet, so there is nothing to train on.');
    }

    const current = await AutonomousAgent.getStatus();
    if (
      !current.config.discoveryEnabled &&
      current.config.discoveryCity &&
      current.config.discoveryNiches.length > 0 &&
      before.canDraft
    ) {
      await AutonomousAgent.configureDiscovery({
        enabled: true,
        city: current.config.discoveryCity,
        niches: current.config.discoveryNiches,
        limit: current.config.discoveryLimit,
      });
      steps.push(`Public discovery resumed for ${current.config.discoveryCity}.`);
    }

    const status = await AutonomousAgent.setEnabled(true);
    steps.push(
      status.autoDm
        ? 'AI switched ON. AUTO DM is ON because a connected provider can deliver messages.'
        : 'AI switched ON in draft-only mode. Add your Instagram keys to enable real sending.',
    );

    return { steps, status, report: await this.getReport() };
  }

  /** One press: stop the loop and disable AUTO DM. Nothing is sent while off. */
  static async deactivate(): Promise<AiActivationResult> {
    const status = await AutonomousAgent.setEnabled(false);
    return {
      steps: ['AI switched OFF. It is not researching, drafting or sending anything.'],
      status,
      report: await this.getReport(),
    };
  }
}


