/**
 * Phase 1 (P1) — Human-triggered public business research.
 *
 * Pipeline: public URL  ->  evidence collection  ->  deterministic website audit (P2)  ->
 * optional AI classification  ->  verified lead information stored as structured data + Evidence rows.
 *
 * Rules honoured here:
 *  - HUMAN TRIGGERED ONLY: nothing in this file runs on a schedule, loop, or background job, and it
 *    never sends messages of any kind. A human presses "Run public research" for a specific lead.
 *  - PUBLIC SOURCES ONLY: the only URLs fetched are the lead's own stored website or a URL a human
 *    typed in. Private Instagram conversations/accounts are never used as external research evidence.
 *  - NO EVIDENCE -> NO CLAIM: every stored field is either an observed fact (with sourceUrl +
 *    fetchedAt + evidenceType) or left null. Values that cannot be verified stay unknown.
 *  - Deterministic work (fetching, HTTP checks, HTML extraction, validation, timing, evidence and
 *    deduplication) is plain TypeScript. Gemini is used only for optional classification of an
 *    already-captured page extract, and its output is quote-verified before storage.
 */

import { prisma } from '../database/client.js';
import { LeadRepository } from '../database/repositories/leadRepository.js';
import { ConversationAnalyzer } from '../ai/analyzer.js';
import { BusinessResearchProfile } from '../ai/schemas/leadSchemas.js';
import { SafeFetchOptions, parseUrlInput } from './httpClient.js';
import {
  ResearchEvidenceDraft,
  WebsiteAuditResult,
  WebsiteAuditor,
} from './websiteAudit.js';

export interface ResearchOptions {
  /** Optional URL typed by a human. Falls back to the lead's stored website. */
  url?: string | null;
  /** Re-run and replace the stored research for the same URL instead of reusing it. */
  force?: boolean;
  /** Set to false to skip the optional Gemini classification step. */
  useAi?: boolean;
  timeoutMs?: number;
  /**
   * TEST-ONLY passthrough to the safe HTTP client (e.g. pointing tests at a loopback mock server).
   * API routes never populate this field.
   */
  fetchOptions?: SafeFetchOptions;
}

export type ResearchStatus =
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'NO_URL'
  | 'URL_REJECTED'
  | 'CACHED';

export interface LeadResearchOutcome {
  status: ResearchStatus;
  targetUrl: string | null;
  cached: boolean;
  research: any | null;
  audit: WebsiteAuditResult | null;
  evidence: ResearchEvidenceDraft[];
  /** Field names that could not be verified and therefore remain unknown/null. */
  unknowns: string[];
  warnings: string[];
  errors: Array<{ code: string; message: string }>;
  isAiGenerated: boolean;
}

export const UNKNOWN_VALUE = 'UNKNOWN';
const MAX_STORED_OBSERVATIONS = 30;

export function jsonArray(values: Array<string> | null | undefined): string | null {
  if (!values || values.length === 0) return null;
  return JSON.stringify(values);
}

function formatStructuredAddress(
  address: WebsiteAuditResult['organizationAddress'],
): string | null {
  if (!address) return null;
  const parts = [address.locality, address.region, address.country]
    .map((part) => (part || '').trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : address.street;
}

export class ResearchService {
  /**
   * Runs one human-triggered research pass for one lead.
   * A failing URL can never throw: the outcome is always a structured result.
   */
  static async researchLead(leadId: string, options: ResearchOptions = {}): Promise<LeadResearchOutcome> {
    const lead = await LeadRepository.findById(leadId);
    if (!lead) {
      throw new Error(`Lead with ID ${leadId} not found.`);
    }

    const warnings: string[] = [];
    const errors: Array<{ code: string; message: string }> = [];

    const storedWebsite = (lead.website || '').trim();
    const candidate = (options.url || '').trim()
      || (storedWebsite && storedWebsite !== UNKNOWN_VALUE ? storedWebsite : '');

    if (!candidate) {
      return {
        status: 'NO_URL',
        targetUrl: null,
        cached: false,
        research: null,
        audit: null,
        evidence: [],
        unknowns: ['website'],
        warnings: ['No public website URL is stored for this lead and none was supplied.'],
        errors,
        isAiGenerated: false,
      };
    }

    const parsed = parseUrlInput(candidate);
    if (!parsed.ok) {
      return {
        status: 'URL_REJECTED',
        targetUrl: candidate,
        cached: false,
        research: null,
        audit: null,
        evidence: [],
        unknowns: ['website'],
        warnings: [`The supplied URL was rejected: ${parsed.error.message}`],
        errors: [{ code: parsed.error.code, message: parsed.error.message }],
        isAiGenerated: false,
      };
    }

    const targetUrl = parsed.url.toString();

    // Duplicate handling: an identical lead + URL pair is reused unless the human forces a refresh.
    const existing = await prisma.businessResearch.findFirst({ where: { leadId, targetUrl } });
    if (existing && !options.force) {
      const storedEvidence = await prisma.evidence.findMany({
        where: {
          leadId,
          sourceUrl: { in: [existing.targetUrl, existing.finalUrl].filter((value): value is string => Boolean(value)) },
        },
        orderBy: { createdAt: 'asc' },
      });

      return {
        status: 'CACHED',
        targetUrl,
        cached: true,
        research: existing,
        audit: null,
        evidence: storedEvidence.map((row) => ({
          claim: row.claim,
          observation: row.observation || row.evidence,
          sourceUrl: row.sourceUrl || targetUrl,
          fetchedAt: (row.fetchedAt || row.createdAt).toISOString(),
          evidenceType: (row.evidenceType as ResearchEvidenceDraft['evidenceType']) || 'OBSERVED_FACT',
          confidence: (String(row.confidence).toLowerCase() as ResearchEvidenceDraft['confidence']) || 'medium',
        })),
        unknowns: [],
        warnings: ['Existing research for this URL was reused. Run again with force to refresh it.'],
        errors,
        isAiGenerated: existing.aiSummaryUsed,
      };
    }

    const audit = await WebsiteAuditor.audit(targetUrl, {
      timeoutMs: options.timeoutMs,
      fetchOptions: options.fetchOptions,
    });
    warnings.push(...audit.warnings);
    errors.push(...audit.errors);

    const sourcedUrl = audit.finalUrl || targetUrl;
    const deterministicEvidence = audit.observations
      .slice(0, MAX_STORED_OBSERVATIONS)
      .map((item) => ({ ...item, sourceUrl: sourcedUrl }));
    const evidenceToStore: ResearchEvidenceDraft[] = [...deterministicEvidence];

    let aiProfile: Awaited<ReturnType<typeof ConversationAnalyzer.summarizeBusinessProfile>>['profile'] = null;
    let isAiGenerated = false;

    if (options.useAi === false) {
      warnings.push('AI classification was disabled for this run (deterministic facts only).');
    } else if (audit.htmlAnalyzed && audit.textExtract) {
      const aiResult = await ConversationAnalyzer.summarizeBusinessProfile({
        sourceUrl: sourcedUrl,
        pageTitle: audit.title,
        metaDescription: audit.metaDescription,
        deterministicFacts: deterministicEvidence.map((item) => item.observation),
        pageTextExtract: audit.textExtract,
      });
      aiProfile = aiResult.profile;
      isAiGenerated = aiResult.isAiGenerated;
      if (aiResult.warning) warnings.push(aiResult.warning);
    } else {
      warnings.push('AI classification skipped: no readable page text was available.');
    }

    if (aiProfile && isAiGenerated) {
      evidenceToStore.push(...buildAiEvidence(aiProfile, sourcedUrl, audit.fetchedAt));
    }

    // Deterministic values win over AI values; anything unverified stays null (never guessed).
    const businessName = firstVerified(aiProfile?.businessName, audit.organizationName);
    const businessType = aiProfile?.businessType ?? null;
    const category = aiProfile && aiProfile.category !== UNKNOWN_VALUE ? aiProfile.category : null;
    const location = firstVerified(aiProfile?.location, formatStructuredAddress(audit.organizationAddress));
    const publicEmail = audit.emailFromPage || aiProfile?.publicEmail || null;
    const publicPhone = audit.phoneFromPage || aiProfile?.publicPhone || null;
    const services = audit.servicesFromStructuredData
      || (aiProfile && aiProfile.services.length > 0 ? aiProfile.services.map((service) => service.name) : null);

    const unknowns: string[] = [];
    if (!businessName) unknowns.push('businessName');
    if (!businessType) unknowns.push('businessType');
    if (!category) unknowns.push('category');
    if (!location) unknowns.push('location');
    if (!publicEmail) unknowns.push('publicEmail');
    if (!publicPhone) unknowns.push('publicPhone');
    if (!services) unknowns.push('services');

    const status: ResearchStatus = !audit.reachable
      ? 'FAILED'
      : audit.htmlAnalyzed
        ? 'COMPLETED'
        : 'PARTIAL';

    const researchData = {
      leadId,
      targetUrl,
      finalUrl: audit.finalUrl,
      status,
      source: 'PUBLIC_WEBSITE',
      reachable: audit.reachable,
      httpStatus: audit.httpStatus,
      statusText: audit.statusText,
      httpsAvailable: audit.httpsAvailable,
      httpsStatus: audit.httpsStatus,
      httpsError: audit.httpsError,
      responseTimeMs: audit.responseTimeMs,
      redirectCount: audit.redirectCount,
      title: audit.title,
      metaDescription: audit.metaDescription,
      canonicalUrl: audit.canonicalUrl,
      language: audit.language,
      viewportMetaPresent: audit.htmlAnalyzed ? audit.viewportMetaPresent : null,
      viewportMetaContent: audit.viewportMetaContent,
      h1Count: audit.htmlAnalyzed ? audit.h1Count : null,
      h1Text: audit.h1Text,
      imageCount: audit.htmlAnalyzed ? audit.imageCount : null,
      imagesMissingAlt: audit.htmlAnalyzed ? audit.imagesMissingAlt : null,
      robotsTxtPresent: audit.robotsTxtPresenceChecked ? audit.robotsTxtPresent : null,
      bookingLinkDetected: audit.htmlAnalyzed ? audit.bookingLinkDetected : null,
      bookingLinks: jsonArray(audit.bookingLinks),
      contactLinkDetected: audit.htmlAnalyzed ? audit.contactLinkDetected : null,
      contactLinks: jsonArray(audit.contactLinks),
      emailLinks: jsonArray(audit.emailLinks),
      phoneLinks: jsonArray(audit.phoneLinks),
      socialLinks: audit.socialLinks.length > 0 ? JSON.stringify(audit.socialLinks) : null,
      structuredDataTypes: jsonArray(audit.structuredDataTypes),
      businessName,
      businessType,
      category,
      location,
      publicEmail,
      publicPhone,
      services: jsonArray(services),
      observations: jsonArray(deterministicEvidence.map((item) => item.observation)),
      aiSummaryUsed: isAiGenerated,
      aiConfidence: aiProfile?.confidence || null,
      warnings: jsonArray(warnings),
    };

    if (existing) {
      // Replace, never duplicate: drop the evidence rows recorded by the previous run for this URL.
      const previousUrls = [existing.targetUrl, existing.finalUrl]
        .filter((value): value is string => Boolean(value));
      if (previousUrls.length > 0) {
        await prisma.evidence.deleteMany({ where: { leadId, sourceUrl: { in: previousUrls } } });
      }
    }

    const research = existing
      ? await prisma.businessResearch.update({ where: { id: existing.id }, data: researchData })
      : await prisma.businessResearch.create({ data: researchData });

    for (const item of evidenceToStore) {
      await prisma.evidence.create({
        data: {
          leadId,
          claim: item.claim,
          evidence: item.quote || item.observation,
          source: item.sourceUrl,
          confidence: item.confidence,
          sourceUrl: item.sourceUrl,
          observation: item.observation,
          fetchedAt: new Date(item.fetchedAt),
          evidenceType: item.evidenceType,
        },
      });
    }

    if (!storedWebsite || storedWebsite === UNKNOWN_VALUE) {
      if (audit.reachable && audit.finalUrl) {
        await prisma.lead.update({ where: { id: leadId }, data: { website: audit.finalUrl } });
        warnings.push(`Lead website field was filled from the verified final URL (${audit.finalUrl}).`);
      }
    }

    return {
      status,
      targetUrl,
      cached: false,
      research,
      audit,
      evidence: evidenceToStore,
      unknowns,
      warnings,
      errors,
      isAiGenerated,
    };
  }

  /** Stored research runs for a lead, newest first. */
  static async getResearchForLead(leadId: string) {
    return prisma.businessResearch.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

function firstVerified(primary: string | null | undefined, fallback: string | null | undefined): string | null {
  const first = (primary || '').trim();
  if (first) return first;
  const second = (fallback || '').trim();
  return second || null;
}

/**
 * Turns a quote-verified AI profile into evidence drafts. Everything produced here is already
 * confirmed to appear verbatim on the page (see `verifyQuotedResearchProfile`), and is labelled
 * AI_INFERENCE so a human can always tell interpretation apart from direct observation.
 */
function buildAiEvidence(
  profile: BusinessResearchProfile,
  sourceUrl: string,
  fetchedAt: string,
): ResearchEvidenceDraft[] {
  const items: ResearchEvidenceDraft[] = [];
  const confidence = String(profile.confidence).toLowerCase() as ResearchEvidenceDraft['confidence'];

  const push = (claim: string, observation: string, quote: string | null) => {
    items.push({ claim, observation, sourceUrl, fetchedAt, evidenceType: 'AI_INFERENCE', confidence, quote });
  };

  if (profile.businessName) push('Business name (AI classification)', `Business name: ${profile.businessName}`, profile.businessName);
  if (profile.businessType) push('Business type (AI classification)', `Business type: ${profile.businessType}`, profile.businessType);
  if (profile.category && profile.category !== UNKNOWN_VALUE) {
    push('Business category (AI classification)', `Category: ${profile.category}`, profile.category);
  }
  if (profile.location) push('Location (AI classification)', `Location: ${profile.location}`, profile.location);
  if (profile.publicEmail) push('Public email (AI classification)', 'Public email confirmed on the page', profile.publicEmail);
  if (profile.publicPhone) push('Public phone (AI classification)', 'Public phone confirmed on the page', profile.publicPhone);
  if (profile.bookingFlow) push('Booking flow (AI classification)', `Booking flow: ${profile.bookingFlow}`, null);

  for (const service of profile.services) {
    push('Service offered (AI classification)', `Service: ${service.name}`, service.evidenceQuote);
  }
  for (const observation of profile.observations) {
    push('Business observation (AI classification)', observation.observation, observation.evidenceQuote);
  }

  return items;
}
