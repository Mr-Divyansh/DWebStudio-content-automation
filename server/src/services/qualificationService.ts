/**
 * P3 — Lead Qualification Engine (deterministic, evidence-based).
 *
 * Turns stored Phase 1 research (BusinessResearch) and Evidence rows into a transparent
 * qualification result. It is 100% rule-based: no AI call, no hidden score, and the same inputs
 * always produce the same output.
 *
 * Hard rules honoured here:
 *  - NO EVIDENCE -> NO CLAIM. Every factual reason carries `evidenceIds` pointing at real rows.
 *  - Never infer willingness to buy. A missing website is NOT a qualification by itself; an
 *    existing website is NOT a disqualification by itself.
 *  - Unknown stays unknown: an unverifiable signal produces NEEDS_REVIEW, never a guess.
 *  - Conflicting signals (e.g. one run unreachable, another reachable) -> NEEDS_REVIEW.
 *  - Status vocabulary is exactly QUALIFIED | NOT_QUALIFIED | NEEDS_REVIEW.
 *  - Portfolio matching only ever returns an EXISTING PortfolioProject row or null.
 *  - Human-triggered only; never sends anything and is never called in a loop.
 */

import { prisma } from '../database/client.js';
import { PortfolioRepository } from '../database/repositories/portfolioRepository.js';

export type QualificationStatus = 'QUALIFIED' | 'NOT_QUALIFIED' | 'NEEDS_REVIEW';
export type QualificationConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type ReasonType = 'EXPLICIT_REQUEST' | 'OBSERVATION' | 'EXCLUSION' | 'CONFLICT' | 'MISSING_DATA';

export interface QualificationReason {
  ruleId: string;
  type: ReasonType;
  reason: string;
  evidenceIds: string[];
}

export interface PortfolioMatchResult {
  /** Snapshot of an existing project, or null when no existing project fits. */
  project: { id: string; title: string; category: string; liveUrl: string | null } | null;
  reason: string;
  confidence: QualificationConfidence;
}

export interface QualificationScoreSignal {
  signal: string;
  points: number;
  evidenceIds: string[];
}

export interface QualificationOutcome {
  id?: string;
  createdAt?: Date;
  status: QualificationStatus;
  confidence: QualificationConfidence;
  reasons: QualificationReason[];
  portfolioMatch: PortfolioMatchResult;
  nextAction: string;
  score: number;
  segment: string;
  scoreBreakdown: QualificationScoreSignal[];
  ruleTrace: Array<{ ruleId: string; fired: boolean; note: string }>;
  evidence: Array<{ id: string; sourceUrl: string | null; observation: string | null; fetchedAt: Date | null }>;
  researchCount: number;
  cached: boolean;
}

/* ------------------------------------------------------------------ helpers */

function evidenceIdForClaim(evidence: any[], claim: string): string[] {
  return evidence.filter((row) => String(row?.claim || '') === claim).map((row) => String(row.id));
}

function parseJsonList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function isUnknown(value: string | null | undefined): boolean {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === '' || normalized === 'UNKNOWN' || normalized === 'NO_MATCH';
}

/**
 * Explicit public statements that a business is seeking a website/developer. Matched only against
 * already-stored, quote-verified evidence text — never inferred by this engine.
 */
const EXPLICIT_REQUEST_PATTERNS: RegExp[] = [
  /\b(looking for|need|needs|want|wants|seeking)\b[^.]{0,60}\b(website|web ?site|web designer|web developer|developer|redesign|rebuild)\b/i,
  /\b(hiring|commissioning|contracting)\b[^.]{0,40}\b(web ?site|website|web developer|web designer|developer|designer)\b/i,
  /\b(website|web ?site|web developer|web designer)\b[^.]{0,40}\b(recommendation|referral|quote|estimate|proposal)\b/i,
];

/** Explicit public statements that the business does not want such a service. */
const EXPLICIT_REJECTION_PATTERNS: RegExp[] = [
  /\bnot interested\b[^.]{0,40}\b(website|web ?site|web design|web developer|redesign|marketing agency)\b/i,
  /\bdo not (?:contact|reach out)\b/i,
  /\bplease (?:do not|don'?t) (?:contact|reach out|email|call)\b/i,
  /\bno longer (?:accepting|looking for|interested in)\b/i,
  /\bunsubscribe\b/i,
];

function findMatchingEvidence(evidence: any[], patterns: RegExp[]): any[] {
  return evidence.filter((row) => {
    const text = `${row?.observation || ''} ${row?.evidence || ''}`;
    return patterns.some((pattern) => pattern.test(text));
  });
}

/* ------------------------------------------------------------- rule plumbing */

interface RuleContext {
  lead: { id: string; website: string; qualification: string; intent: string; niche: string; interestLevel: string };
  research: any[];
  evidence: any[];
}

interface RuleResult {
  ruleId: string;
  fired: boolean;
  result?: { status: QualificationStatus; type: ReasonType; reason: string; evidenceIds: string[] };
  note: string;
}

const noFire = (ruleId: string, note: string): RuleResult => ({ ruleId, fired: false, note });
const fire = (ruleId: string, result: NonNullable<RuleResult['result']>, note: string): RuleResult => ({ ruleId, fired: true, result, note });

/** Latest run that was fully analyzed (reachable, not blocked, completed). */
function completedRun(research: any[]): any | undefined {
  return research.find((run) => run.status === 'COMPLETED' && run.reachable && !run.blocked);
}

/* ------------------------------------------------------------------- rules */

export const QUALIFICATION_RULES: Array<{
  id: string;
  description: string;
  evaluate: (ctx: RuleContext) => RuleResult;
}> = [
  {
    id: 'REQUEST-001',
    description: 'Explicit public evidence that the business is seeking a website/developer/redesign.',
    evaluate(ctx) {
      const matches = findMatchingEvidence(ctx.evidence, EXPLICIT_REQUEST_PATTERNS);
      if (matches.length === 0) return noFire('REQUEST-001', 'No explicit website/developer request in evidence.');
      return fire(
        'REQUEST-001',
        {
          status: 'QUALIFIED',
          type: 'EXPLICIT_REQUEST',
          reason: 'Public evidence explicitly states the business is looking for a website, web developer/designer or redesign.',
          evidenceIds: matches.map((row) => String(row.id)),
        },
        `${matches.length} explicit request evidence row(s).`,
      );
    },
  },
  {
    id: 'EXCLUSION-001',
    description: 'Explicit public evidence that the business declines such services / asks not to be contacted.',
    evaluate(ctx) {
      const matches = findMatchingEvidence(ctx.evidence, EXPLICIT_REJECTION_PATTERNS);
      if (matches.length === 0) return noFire('EXCLUSION-001', 'No explicit rejection evidence.');
      return fire(
        'EXCLUSION-001',
        {
          status: 'NOT_QUALIFIED',
          type: 'EXCLUSION',
          reason: 'Public evidence explicitly declines such services or asks not to be contacted.',
          evidenceIds: matches.map((row) => String(row.id)),
        },
        `${matches.length} explicit rejection evidence row(s).`,
      );
    },
  },
  {
    id: 'WEB-ABSENT-001',
    description: 'No website stored and no public research run: website state is UNKNOWN.',
    evaluate(ctx) {
      if (!isUnknown(ctx.lead.website) || ctx.research.length > 0) {
        return noFire('WEB-ABSENT-001', 'Website present or research already exists.');
      }
      return fire(
        'WEB-ABSENT-001',
        {
          status: 'NEEDS_REVIEW',
          type: 'MISSING_DATA',
          // Nothing was checked, so this is an explicit "not verified" statement (no evidence ids),
          // never a claim that the business has no website.
          reason: 'No website is stored and no public research has been run, so the website situation is UNKNOWN. Absence alone is not treated as an opportunity.',
          evidenceIds: [],
        },
        'No website and no research — nothing verifiable yet.',
      );
    },
  },
  {
    id: 'WEB-CONFLICT-001',
    description: 'Stored research runs disagree about reachability/status: resolve manually.',
    evaluate(ctx) {
      if (ctx.research.length < 2) return noFire('WEB-CONFLICT-001', 'Fewer than two research runs.');
      const reachability = new Set(ctx.research.map((run) => Boolean(run.reachable)));
      const statuses = new Set(ctx.research.map((run) => String(run.status)));
      if (reachability.size <= 1 && statuses.size <= 1) return noFire('WEB-CONFLICT-001', 'All runs agree.');
      const cited = ctx.research.flatMap((run) =>
        ctx.evidence
          .filter((row) => row.sourceUrl && (row.sourceUrl === run.targetUrl || row.sourceUrl === run.finalUrl))
          .map((row) => String(row.id)),
      );
      return fire(
        'WEB-CONFLICT-001',
        {
          status: 'NEEDS_REVIEW',
          type: 'CONFLICT',
          reason: 'Stored research runs disagree about website reachability/status, so the website state is unresolved and must be verified manually.',
          evidenceIds: Array.from(new Set(cited)),
        },
        `${ctx.research.length} runs with differing outcomes.`,
      );
    },
  },
  {
    id: 'WEB-REACH-001',
    description: 'Website could not be verified (unreachable / timeout / TLS / DNS failure).',
    evaluate(ctx) {
      const latest = ctx.research[0];
      if (!latest || latest.reachable) return noFire('WEB-REACH-001', 'Latest run reachable or no run.');
      const evidenceIds = evidenceIdForClaim(ctx.evidence, 'Website reachable');
      const observation = ctx.evidence.find((row) => evidenceIds.includes(String(row.id)))?.observation || 'no response received';
      return fire(
        'WEB-REACH-001',
        {
          status: 'NEEDS_REVIEW',
          type: 'OBSERVATION',
          reason: `Website could not be verified because the request failed (${observation}). This is not a statement about website quality.`,
          evidenceIds,
        },
        `Latest run status=${latest.status}, reachable=false.`,
      );
    },
  },
  {
    id: 'WEB-BLOCK-001',
    description: 'HTTP access/bot-protection response (403 etc.): content was not evaluated.',
    evaluate(ctx) {
      const latest = ctx.research[0];
      if (!latest || !latest.blocked) return noFire('WEB-BLOCK-001', 'Latest run is not blocked.');
      const evidenceIds = [
        ...evidenceIdForClaim(ctx.evidence, 'Access blocked'),
        ...evidenceIdForClaim(ctx.evidence, 'HTML analysis'),
      ];
      return fire(
        'WEB-BLOCK-001',
        {
          status: 'NEEDS_REVIEW',
          type: 'MISSING_DATA',
          reason: `Website responded with HTTP ${latest.httpStatus ?? 'unknown'} (access/bot-protection), so the real page content could not be evaluated. Manual verification in a browser is required.`,
          evidenceIds: Array.from(new Set(evidenceIds)),
        },
        `Blocked run (HTTP ${latest.httpStatus}).`,
      );
    },
  },
  {
    id: 'WEB-FUNCTION-001',
    description: 'Completed audit shows booking + contact functionality: no objective gap observed.',
    evaluate(ctx) {
      const latest = completedRun(ctx.research);
      if (!latest) return noFire('WEB-FUNCTION-001', 'No completed reachable audit.');
      if (latest.bookingLinkDetected !== true || latest.contactLinkDetected !== true) {
        return noFire('WEB-FUNCTION-001', 'Booking or contact not detected.');
      }
      const evidenceIds = [
        ...evidenceIdForClaim(ctx.evidence, 'Booking link'),
        ...evidenceIdForClaim(ctx.evidence, 'Contact link'),
      ];
      return fire(
        'WEB-FUNCTION-001',
        {
          status: 'NEEDS_REVIEW',
          type: 'OBSERVATION',
          reason: 'The website is reachable and exposes both booking and contact functionality. No objective website gap was observed; an existing website is not treated as a disqualification.',
          evidenceIds: Array.from(new Set(evidenceIds)),
        },
        'Booking + contact detected on a completed audit.',
      );
    },
  },
  {
    id: 'WEB-BOOKING-001',
    description: 'Completed audit without a detected booking link (objective observation only).',
    evaluate(ctx) {
      const latest = completedRun(ctx.research);
      if (!latest) return noFire('WEB-BOOKING-001', 'No completed reachable audit.');
      if (latest.bookingLinkDetected !== false) return noFire('WEB-BOOKING-001', 'Booking detected or not evaluated.');
      const evidenceIds = evidenceIdForClaim(ctx.evidence, 'Booking link');
      return fire(
        'WEB-BOOKING-001',
        {
          status: 'NEEDS_REVIEW',
          type: 'OBSERVATION',
          reason: 'No booking link was detected on the audited website (objective observation only — no judgement about website quality).',
          evidenceIds,
        },
        'Booking link not detected.',
      );
    },
  },
  {
    id: 'WEB-CONTACT-001',
    description: 'Completed audit without contact link, public email or public phone.',
    evaluate(ctx) {
      const latest = completedRun(ctx.research);
      if (!latest) return noFire('WEB-CONTACT-001', 'No completed reachable audit.');
      const hasContactLink = latest.contactLinkDetected === true;
      const emailLinks = parseJsonList(latest.emailLinks).length;
      const phoneLinks = parseJsonList(latest.phoneLinks).length;
      if (hasContactLink || emailLinks > 0 || phoneLinks > 0) {
        return noFire('WEB-CONTACT-001', 'Contact information available.');
      }
      const evidenceIds = [
        ...evidenceIdForClaim(ctx.evidence, 'Contact link'),
        ...evidenceIdForClaim(ctx.evidence, 'Public email links'),
        ...evidenceIdForClaim(ctx.evidence, 'Public phone links'),
      ];
      return fire(
        'WEB-CONTACT-001',
        {
          status: 'NEEDS_REVIEW',
          type: 'OBSERVATION',
          reason: 'No contact link, public email or public phone was detected on the audited website.',
          evidenceIds,
        },
        'No contact information detected.',
      );
    },
  },
  {
    id: 'WEB-STRONG-001',
    description: 'No website stored, but a public page confirmed the business exists (still needs review).',
    evaluate(ctx) {
      if (!isUnknown(ctx.lead.website) || ctx.research.length === 0) {
        return noFire('WEB-STRONG-001', 'Website present or no research run.');
      }
      const latest = completedRun(ctx.research);
      if (!latest) return noFire('WEB-STRONG-001', 'No completed reachable run for a website-less lead.');
      const identityIds = [
        ...evidenceIdForClaim(ctx.evidence, 'Organization name (structured data)'),
        ...evidenceIdForClaim(ctx.evidence, 'Title tag'),
        ...evidenceIdForClaim(ctx.evidence, 'H1 text'),
      ];
      if (identityIds.length === 0) return noFire('WEB-STRONG-001', 'No identity evidence for the researched URL.');
      return fire(
        'WEB-STRONG-001',
        {
          status: 'NEEDS_REVIEW',
          type: 'OBSERVATION',
          reason: 'The lead has no stored website, while a public page confirmed the business exists. A missing website alone does not qualify a lead; human review is required.',
          evidenceIds: Array.from(new Set(identityIds)),
        },
        'No website stored + verified public business page.',
      );
    },
  },
  {
    id: 'DATA-INSUFFICIENT-001',
    description: 'No research run exists: qualification would require guessing.',
    evaluate(ctx) {
      if (ctx.research.length > 0) return noFire('DATA-INSUFFICIENT-001', 'Research exists.');
      return fire(
        'DATA-INSUFFICIENT-001',
        {
          status: 'NEEDS_REVIEW',
          type: 'MISSING_DATA',
          reason: 'No public research has been run for this lead, so there is not enough verified information to qualify.',
          evidenceIds: [],
        },
        'No research at all.',
      );
    },
  },
];

/* --------------------------------------------------------------- combination */

function combineResults(results: RuleResult[]): { status: QualificationStatus; reasons: QualificationReason[] } {
  const fired = results.filter((rule) => rule.fired && rule.result) as Array<
    RuleResult & { result: NonNullable<RuleResult['result']> }
  >;
  const reasons: QualificationReason[] = fired.map((rule) => ({
    ruleId: rule.ruleId,
    type: rule.result.type,
    reason: rule.result.reason,
    evidenceIds: rule.result.evidenceIds,
  }));

  const hasRejection = fired.some((rule) => rule.result.status === 'NOT_QUALIFIED');
  const hasRequest = fired.some((rule) => rule.result.status === 'QUALIFIED');

  // Deterministic precedence: explicit rejection > explicit request > review.
  // No explicit statement either way always means NEEDS_REVIEW (never inferred from a website).
  const status: QualificationStatus = hasRejection ? 'NOT_QUALIFIED' : hasRequest ? 'QUALIFIED' : 'NEEDS_REVIEW';
  return { status, reasons };
}

function computeConfidence(status: QualificationStatus, reasons: QualificationReason[], evidenceCount: number): QualificationConfidence {
  // Deterministic: derived only from whether explicit statements exist and how much verified
  // evidence backs the fired rules. Never an AI-produced number.
  const cited = new Set(reasons.flatMap((reason) => reason.evidenceIds));
  const explicit = reasons.some((reason) => reason.type === 'EXPLICIT_REQUEST' || reason.type === 'EXCLUSION');
  if (status === 'NEEDS_REVIEW') return 'LOW';
  if (explicit && cited.size >= 1) return 'HIGH';
  if (cited.size >= 2 && evidenceCount >= 2) return 'MEDIUM';
  return 'LOW';
}

function nextActionFor(status: QualificationStatus): string {
  if (status === 'QUALIFIED') return 'Human review required before any outreach is drafted or sent.';
  if (status === 'NOT_QUALIFIED') return 'No outreach recommended by current qualification rules.';
  return 'Verify the business website/profile manually, then run qualification again.';
}

function scoreQualification(reasons: QualificationReason[], evidence: any[]): { score: number; segment: string; breakdown: QualificationScoreSignal[] } {
  const breakdown: QualificationScoreSignal[] = [];
  const hasEvidence = (ids: string[]) => ids.length > 0;
  for (const reason of reasons) {
    if (!hasEvidence(reason.evidenceIds)) continue;
    const points = reason.type === 'EXPLICIT_REQUEST' ? 40 :
      reason.type === 'EXCLUSION' ? -40 :
      reason.ruleId === 'WEB-STRONG-001' ? 20 :
      reason.ruleId === 'WEB-BOOKING-001' || reason.ruleId === 'WEB-CONTACT-001' ? 10 : 5;
    breakdown.push({ signal: reason.ruleId, points, evidenceIds: reason.evidenceIds });
  }
  if (breakdown.length === 0) {
    return { score: 0, segment: 'UNSCORED', breakdown: [{ signal: 'NO_SCORED_EVIDENCE', points: 0, evidenceIds: [] }] };
  }
  const score = Math.max(0, Math.min(100, breakdown.reduce((sum, item) => sum + item.points, 0)));
  const segment = score >= 60 ? 'HOT' : score >= 30 ? 'WARM' : score > 0 ? 'REVIEW' : 'COLD';
  return { score, segment, breakdown };
}

/* -------------------------------------------------------- portfolio matching */

async function matchPortfolio(latest: any | undefined, leadNiche: string): Promise<PortfolioMatchResult> {
  const projects = await PortfolioRepository.findAll();
  const category = (latest?.category && !isUnknown(latest.category) ? String(latest.category) : null) ||
    (leadNiche && !isUnknown(leadNiche) ? String(leadNiche) : null);

  if (!category) {
    return {
      project: null,
      reason: 'No verified business category is available, so no portfolio project can be matched.',
      confidence: 'LOW',
    };
  }

  const normalized = category.trim().toLowerCase();
  // Only existing portfolio rows are ever returned; nothing is invented.
  const match = projects.find((project: any) => {
    const projectCategory = String(project.category || '').trim().toLowerCase();
    return projectCategory === normalized || projectCategory.includes(normalized) || normalized.includes(projectCategory);
  });

  if (!match) {
    return {
      project: null,
      reason: `No existing D Web Studio portfolio project matches the verified category "${category}".`,
      confidence: 'HIGH',
    };
  }
  return {
    project: { id: match.id, title: match.title, category: match.category, liveUrl: match.liveUrl || null },
    reason: `Matched existing portfolio project "${match.title}" (category "${match.category}") to the verified category "${category}".`,
    confidence: String(match.category || '').trim().toLowerCase() === normalized ? 'HIGH' : 'MEDIUM',
  };
}

/* ------------------------------------------------------------------ service */

export class QualificationService {
  /**
   * Human-triggered qualification for ONE lead. Deterministic: identical stored inputs always
   * produce an identical result. Historical runs are preserved (one new row per real run).
   */
  static async qualifyLead(leadId: string, options: { force?: boolean } = {}): Promise<QualificationOutcome> {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, website: true, qualification: true, intent: true, niche: true, interestLevel: true },
    });
    if (!lead) throw new Error(`Lead with ID ${leadId} not found.`);

    const [researchRows, evidenceRows] = await Promise.all([
      prisma.businessResearch.findMany({ where: { leadId }, orderBy: { createdAt: 'desc' } }),
      prisma.evidence.findMany({ where: { leadId }, orderBy: { createdAt: 'asc' } }),
    ]);

    const ctx: RuleContext = { lead, research: researchRows, evidence: evidenceRows };
    const ruleResults = QUALIFICATION_RULES.map((rule) => rule.evaluate(ctx));
    const { status, reasons } = combineResults(ruleResults);
    const confidence = computeConfidence(status, reasons, evidenceRows.length);
    const scored = scoreQualification(reasons, evidenceRows);
    const portfolioMatch = await matchPortfolio(researchRows[0], lead.niche);
    const nextAction = nextActionFor(status);

    const citedIds = new Set(reasons.flatMap((reason) => reason.evidenceIds));
    const evidence = evidenceRows
      .filter((row) => citedIds.has(String(row.id)))
      .map((row) => ({
        id: String(row.id),
        sourceUrl: row.sourceUrl,
        observation: row.observation || row.evidence,
        fetchedAt: row.fetchedAt,
      }));

    const outcome: QualificationOutcome = {
      status,
      confidence,
      reasons,
      portfolioMatch,
      nextAction,
      score: scored.score,
      segment: scored.segment,
      scoreBreakdown: scored.breakdown,
      ruleTrace: ruleResults.map((rule) => ({ ruleId: rule.ruleId, fired: rule.fired, note: rule.note })),
      evidence,
      researchCount: researchRows.length,
      cached: false,
    };

    if (options.force === false) {
      // Caching: if the most recent stored run has the same status/confidence and the evidence
      // count is unchanged, reuse it instead of writing a duplicate history row.
      const previous = await prisma.leadQualification.findFirst({ where: { leadId }, orderBy: { createdAt: 'desc' } });
      if (
        previous &&
        previous.status === status &&
        previous.confidence === confidence &&
        previous.nextAction === nextAction
      ) {
        const previousReasons = JSON.parse(previous.reasons || '[]') as QualificationReason[];
        const sameReasons = JSON.stringify(previousReasons) === JSON.stringify(reasons);
        if (sameReasons) {
          return { ...outcome, cached: true, id: previous.id, createdAt: previous.createdAt };
        }
      }
    }

    const saved = await prisma.leadQualification.create({
      data: {
        leadId,
        status,
        confidence,
        reasons: JSON.stringify(reasons),
        portfolioMatch: JSON.stringify(portfolioMatch),
        nextAction,
        score: scored.score,
        segment: scored.segment,
        scoreBreakdown: JSON.stringify(scored.breakdown),
      },
    });

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        qualification: status === 'QUALIFIED' ? 'QUALIFIED' : status === 'NOT_QUALIFIED' ? 'DISQUALIFIED' : 'PENDING_INFO',
        qualificationReason: reasons.map((reason) => reason.reason).join(' '),
        opportunityScore: scored.score,
        opportunitySegment: scored.segment,
        scoreBreakdown: JSON.stringify(scored.breakdown),
      },
    });

    return { ...outcome, id: saved.id, createdAt: saved.createdAt };
  }

  /** Stored qualification runs for a lead, newest first. */
  static async getQualificationsForLead(leadId: string) {
    return prisma.leadQualification.findMany({ where: { leadId }, orderBy: { createdAt: 'desc' } });
  }
}

