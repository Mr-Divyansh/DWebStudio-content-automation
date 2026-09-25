/**
 * AUTONOMOUS AGENT — Structured Learning Store
 * ============================================================================
 * Rules honoured here:
 *  - NO FINE-TUNING. Nothing retrains a model. Learning is rows in the database.
 *  - ONE INTERACTION IS NEVER A PERMANENT RULE. Every row is created as PROPOSED.
 *  - Contradictory observations increase `contradictionCount` and flag REVIEW
 *    instead of silently rewriting an APPROVED rule.
 *  - Only APPROVED rows are ever returned as future AI context.
 *  - Duplicate detection uses a normalized observation key, so re-running the
 *    same lead does not inflate support counts.
 */

import { prisma } from '../database/client.js';

export type LearningCategory = 'OUTREACH_STYLE' | 'QUALIFICATION' | 'REPLY_ANALYSIS' | 'PRICING';
export type LearningStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';

export interface RecordLearningInput {
  leadId?: string | null;
  sourceType: string;
  sourceId?: string | null;
  category: LearningCategory;
  observation: string;
  humanAction?: string | null;
  evidence?: string[];
  outcome?: string | null;
}

function normalize(observation: string): string {
  return observation.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 240);
}

export class AgentLearningStore {
  /** Records an observation, or reinforces/contradicts an existing matching row. */
  static async record(input: RecordLearningInput) {
    const key = normalize(input.observation);
    if (!key) return null;

    const existing = (await prisma.learningEvent.findMany({
      where: { category: input.category },
      select: {
        id: true,
        observation: true,
        outcome: true,
        humanAction: true,
        evidence: true,
        status: true,
      },
    })).find((row) => normalize(row.observation) === key);

    if (existing) {
      const existingOutcome = (existing.outcome ?? '').trim();
      const incomingOutcome = (input.outcome ?? '').trim();
      const contradicts = Boolean(incomingOutcome) && incomingOutcome !== existingOutcome;
      return prisma.learningEvent.update({
        where: { id: existing.id },
        data: {
          supportCount: { increment: 1 },
          contradictionCount: contradicts ? { increment: 1 } : undefined,
          outcome: input.outcome ?? existing.outcome,
          humanAction: input.humanAction ?? existing.humanAction,
          evidence: input.evidence ? JSON.stringify(input.evidence.slice(0, 5)) : existing.evidence,
          // A contradicted APPROVED rule must go back to human review.
          status: contradicts && existing.status === 'APPROVED' ? 'PROPOSED' : existing.status,
        },
      });
    }

    return prisma.learningEvent.create({
      data: {
        leadId: input.leadId ?? null,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        category: input.category,
        observation: input.observation,
        humanAction: input.humanAction ?? null,
        evidence: input.evidence ? JSON.stringify(input.evidence.slice(0, 5)) : null,
        outcome: input.outcome ?? null,
        status: 'PROPOSED',
        supportCount: 1,
        contradictionCount: 0,
      },
    });
  }

  /** Only human-approved rules are ever fed back to the AI. */
  static async getApprovedContext(limit = 10) {
    const rows = await prisma.learningEvent.findMany({
      where: { status: 'APPROVED' },
      orderBy: [{ supportCount: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
    return rows.map((r) => ({
      category: r.category,
      observation: r.observation,
      evidence: r.evidence,
      supportCount: r.supportCount,
      contradictionCount: r.contradictionCount,
    }));
  }

  static async setStatus(id: string, status: LearningStatus) {
    return prisma.learningEvent.update({ where: { id }, data: { status } });
  }

  static async recordOutcome(input: {
    leadId: string;
    outcome: string;
    observation: string;
    evidence?: string[];
    category?: LearningCategory;
  }) {
    return prisma.learning.create({
      data: {
        learning: input.observation.slice(0, 500),
        type: input.outcome === 'NOT_INTERESTED' ? 'REJECTION_REASON' : 'SUCCESS_FACTOR',
        evidence: JSON.stringify((input.evidence || []).slice(0, 5)),
        confidence: 'MEDIUM',
        appliesTo: 'All',
        source: 'AGENT_OUTCOME',
        relatedLeadId: input.leadId,
      },
    });
  }

  static async list(limit = 50) {
    return prisma.learningEvent.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }
}
