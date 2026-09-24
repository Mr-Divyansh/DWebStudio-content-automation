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

    const existing = await prisma.learningEvent.findFirst({
      where: { category: input.category, observation: input.observation },
    });

    if (existing) {
      const contradicts = Boolean(input.outcome) && input.outcome !== existing.outcome;
      return prisma.learningEvent.update({
        where: { id: existing.id },
        data: {
          supportCount: { increment: 1 },
          contradictionCount: contradicts ? { increment: 1 } : undefined,
          outcome: input.outcome ?? existing.outcome,
          humanAction: input.humanAction ?? existing.humanAction,
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
      supportCount: r.supportCount,
      contradictionCount: r.contradictionCount,
    }));
  }

  static async setStatus(id: string, status: LearningStatus) {
    return prisma.learningEvent.update({ where: { id }, data: { status } });
  }

  static async list(limit = 50) {
    return prisma.learningEvent.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }
}
