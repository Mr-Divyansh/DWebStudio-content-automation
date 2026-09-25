import { getGeminiClient, generateGeminiJson } from './gemini.js';
import {
  ConversationAnalysisSchema,
  ConversationAnalysis,
  OutreachDraftSchema,
  OutreachDraftResult,
  LearningExtractionSchema,
  LearningExtractionResult,
  ReplyAnalysisSchema,
  ReplyAnalysis,
  BusinessResearchProfileSchema,
  BusinessResearchProfile,
} from './schemas/leadSchemas.js';
import {
  buildConversationAnalysisPrompt,
  buildOutreachDraftPrompt,
  buildLearningExtractionPrompt,
  buildBusinessResearchPrompt,
  buildReplyAnalysisPrompt,
} from './prompts/analysisPrompts.js';
import fs from 'fs';
import path from 'path';

function loadKnowledgeFile(filename: string): string {
  try {
    const fullPath = path.resolve(process.cwd(), 'knowledge', filename);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf8');
    }
  } catch (err) {
    console.warn(`Could not read knowledge/${filename}:`, err);
  }
  return '';
}

function cleanJsonString(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

/**
 * Phase 1 (P1) — No-Invention guard for the optional AI business classification.
 *
 * The AI is instructed to support every value with verbatim page text. This function enforces that
 * contract deterministically: quotes must be found in the page extract (>= 12 characters, whitespace
 * and case insensitive) and scalar values must appear in the page text or the deterministic facts.
 * Anything unsupported is discarded and reported, so unverifiable AI output can never reach the
 * database or the UI.
 */
export const MIN_RESEARCH_QUOTE_CHARS = 12;

export function normalizeForQuoteMatch(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface QuotedProfileVerification {
  profile: BusinessResearchProfile;
  dropped: string[];
}

export function verifyQuotedResearchProfile(
  profile: BusinessResearchProfile,
  context: { pageExtract: string | null; deterministicFacts?: string[] },
): QuotedProfileVerification {
  const extract = normalizeForQuoteMatch(context.pageExtract || '');
  const haystack = normalizeForQuoteMatch(
    `${(context.deterministicFacts || []).join(' ')} ${context.pageExtract || ''}`,
  );
  const dropped: string[] = [];

  const verifyScalar = (field: string, value: string | null, allowFacts: boolean): string | null => {
    const trimmed = value ? value.trim() : '';
    if (!trimmed) return null;
    const source = allowFacts ? haystack : extract;
    if (!source.includes(normalizeForQuoteMatch(trimmed))) {
      dropped.push(`${field} (not supported by page text)`);
      return null;
    }
    return trimmed;
  };

  const verified: BusinessResearchProfile = {
    ...profile,
    businessName: verifyScalar('businessName', profile.businessName, true),
    businessType: verifyScalar('businessType', profile.businessType, true),
    location: verifyScalar('location', profile.location, true),
    publicEmail: verifyScalar('publicEmail', profile.publicEmail, true),
    publicPhone: verifyScalar('publicPhone', profile.publicPhone, true),
    bookingFlow: verifyScalar('bookingFlow', profile.bookingFlow, false),
    services: [],
    observations: [],
  };

  for (const service of profile.services) {
    const quote = normalizeForQuoteMatch(service.evidenceQuote);
    if (quote.length < MIN_RESEARCH_QUOTE_CHARS || !extract.includes(quote)) {
      dropped.push(`service "${service.name}" (quote not found verbatim)`);
      continue;
    }
    verified.services.push(service);
  }

  for (const observation of profile.observations) {
    const quote = normalizeForQuoteMatch(observation.evidenceQuote);
    if (quote.length < MIN_RESEARCH_QUOTE_CHARS || !extract.includes(quote)) {
      dropped.push(`observation "${observation.observation}" (quote not found verbatim)`);
      continue;
    }
    verified.observations.push(observation);
  }

  const hasVerifiedEvidence = Boolean(
    verified.businessName ||
    verified.businessType ||
    verified.location ||
    verified.publicEmail ||
    verified.publicPhone ||
    verified.bookingFlow ||
    verified.services.length > 0 ||
    verified.observations.length > 0,
  );

  if (!hasVerifiedEvidence) {
    verified.insufficientEvidence = true;
    verified.category = 'UNKNOWN';
    verified.confidence = 'LOW';
  } else {
    verified.insufficientEvidence = false;
    if (dropped.length > 0 && verified.confidence === 'HIGH') {
      verified.confidence = 'MEDIUM';
    }
  }

  return { profile: verified, dropped };
}

export class ConversationAnalyzer {
  static async analyzeConversation(options: {
    conversationText: string;
    source: string;
    externalId: string;
    relevantLearnings?: Array<{ learning: string; appliesTo: string; type: string }>;
  }): Promise<{ analysis: ConversationAnalysis; isAiGenerated: boolean; warning?: string }> {
    const ai = getGeminiClient();

    if (!ai) {
      // Fallback: Rule-based heuristic analysis compliant with No-Invention rule
      return {
        analysis: this.heuristicAnalyze(options.conversationText, options.source, options.externalId),
        isAiGenerated: false,
        warning: 'Gemini API key not configured. Analyzed using baseline deterministic rules.',
      };
    }

    const businessKnowledge = loadKnowledgeFile('business.md');
    const rulesKnowledge = loadKnowledgeFile('rules.md');
    const portfolioKnowledge = loadKnowledgeFile('portfolio.md');

    const { systemInstruction, userPrompt } = buildConversationAnalysisPrompt({
      conversationText: options.conversationText,
      source: options.source,
      externalId: options.externalId,
      businessKnowledge,
      rulesKnowledge,
      portfolioKnowledge,
      relevantLearnings: options.relevantLearnings || [],
    });

    try {
      const validated = await generateGeminiJson(
        { systemInstruction, userPrompt, temperature: 0.2, maxOutputTokens: 4_096 },
        (value) => ConversationAnalysisSchema.parse(value),
      );

      return {
        analysis: validated,
        isAiGenerated: true,
      };
    } catch (err: any) {
      console.error('Gemini API call or validation error:', err);
      // Fallback safely so user workflow never crashes
      return {
        analysis: this.heuristicAnalyze(options.conversationText, options.source, options.externalId),
        isAiGenerated: false,
        warning: `AI analysis encountered an error (${err?.message || 'Gemini error'}). Falling back to safe rules.`,
      };
    }
  }

  static async analyzeReply(options: {
    inboundText: string;
    leadInfo: any;
    currentStage: string;
    previousMessages?: Array<{ senderType: string; content: string; timestamp: Date | string }>;
    relevantLearnings?: Array<{ learning: string; appliesTo: string; type: string }>;
  }): Promise<{ analysis: ReplyAnalysis; isAiGenerated: boolean; warning?: string }> {
    const previous = (options.previousMessages || [])
      .slice(-20)
      .map((m) => `[${m.senderType}] ${String(m.content).slice(0, 2_000)}`)
      .join('\n');
    const contextLead = { ...options.leadInfo, previousMessages: previous };
    const { systemInstruction, userPrompt } = buildReplyAnalysisPrompt({
      inboundText: options.inboundText,
      leadInfo: contextLead,
      previousMessages: previous,
      currentStage: options.currentStage,
      relevantLearnings: options.relevantLearnings || [],
    });

    if (!getGeminiClient()) {
      return {
        analysis: this.heuristicReplyAnalysis(options.inboundText, options.currentStage),
        isAiGenerated: false,
        warning: 'Gemini not configured; deterministic reply analysis used.',
      };
    }

    try {
      const analysis = await generateGeminiJson(
        { systemInstruction, userPrompt, temperature: 0.1, maxOutputTokens: 2_048 },
        (value) => ReplyAnalysisSchema.parse(value),
      );
      const normalizedInbound = options.inboundText.toLowerCase();
      const unsupportedEvidence = analysis.evidence.some((quote) => !normalizedInbound.includes(quote.toLowerCase()));
      if (unsupportedEvidence || analysis.confidence === 'LOW') {
        return {
          analysis: this.heuristicReplyAnalysis(options.inboundText, options.currentStage),
          isAiGenerated: false,
          warning: 'AI reply analysis failed evidence/confidence checks; deterministic analysis used.',
        };
      }
      return { analysis, isAiGenerated: true };
    } catch {
      return {
        analysis: this.heuristicReplyAnalysis(options.inboundText, options.currentStage),
        isAiGenerated: false,
        warning: 'AI reply analysis failed; deterministic analysis used.',
      };
    }
  }

  private static heuristicReplyAnalysis(text: string, currentStage: string): ReplyAnalysis {
    const lower = text.toLowerCase();
    const evidence = [text.trim().slice(0, 240)].filter(Boolean);
    const base = {
      intent: 'NEUTRAL' as const,
      confidence: 'LOW' as const,
      evidence,
      reason: 'Deterministic classification from the inbound message.',
      objection: null,
      suggestedNextAction: 'Human review required because intent is uncertain.',
      needsHuman: true,
      needsRequirements: false,
      asksPricing: false,
      purchaseIntent: false,
    };
    if (/\b(not interested|no thanks|stop messaging|do not contact)\b/i.test(lower)) {
      return { ...base, stage: 'NOT_INTERESTED', intent: 'NOT_INTERESTED', confidence: 'HIGH', needsHuman: false, suggestedNextAction: 'Stop all follow-up.' };
    }
    if (/\b(price|pricing|cost|quote|budget|how much|charges?)\b/i.test(lower)) {
      return { ...base, stage: 'PRICING', intent: 'POSSIBLY_INTERESTED', asksPricing: true, suggestedNextAction: 'Answer only from an active configured pricing rule.' };
    }
    if (/\b(ready|proposal|contract|get started|book a call|schedule a call|yes,? let'?s)\b/i.test(lower)) {
      return { ...base, stage: 'READY_TO_BUY', intent: 'INTERESTED', confidence: 'MEDIUM', purchaseIntent: true, suggestedNextAction: 'Confirm requirements and hand the closing details to a human.' };
    }
    if (/\b(interested|need|want|looking for|redesign|website)\b/i.test(lower)) {
      return { ...base, stage: 'QUALIFYING', intent: 'POSSIBLY_INTERESTED', needsRequirements: true, suggestedNextAction: 'Ask one bounded requirements question.' };
    }
    const safeStages = ['NEW', 'QUALIFYING', 'INTERESTED', 'REQUIREMENTS', 'PRICING', 'FOLLOW_UP'] as const;
    const stage = safeStages.includes(currentStage as (typeof safeStages)[number])
      ? (currentStage as (typeof safeStages)[number])
      : 'QUALIFYING';
    return { ...base, stage };
  }

  static async generateOutreachDraft(options: {
    leadInfo: any;
    evidence: any[];
    matchedPortfolio: any;
    learnings: any[];
  }): Promise<{ draft: OutreachDraftResult; isAiGenerated: boolean }> {
    const ai = getGeminiClient();

    if (!ai) {
      const niche = options.leadInfo.niche !== 'UNKNOWN' ? options.leadInfo.niche : 'business';
    const name = options.leadInfo.personName && options.leadInfo.personName !== 'UNKNOWN'
      ? options.leadInfo.personName
      : options.leadInfo.businessName && options.leadInfo.businessName !== 'UNKNOWN'
        ? options.leadInfo.businessName
        : 'there';
    const evidenceFact = options.evidence.find((item) => typeof item?.evidence === 'string' && item.evidence.trim())?.evidence;
    const evidenceReference = evidenceFact ? ` I noticed one public detail worth checking: "${String(evidenceFact).slice(0, 180)}".` : '';
    const portfolioRef = options.matchedPortfolio
      ? ` We have a relevant ${options.matchedPortfolio.title} example${options.matchedPortfolio.results ? `: ${options.matchedPortfolio.results}` : ''}.`
      : '';
    return {
      draft: {
        channel: 'INSTAGRAM_DM',
        messageBody: `Hi ${name}, I came across ${niche === 'business' ? 'your business' : `your ${niche} business`}.${evidenceReference}${portfolioRef} If a clearer website could help, I can share a short relevant outline for your review.`,
        personalizationReason: evidenceFact ? 'References one stored public evidence item and an existing portfolio match.' : 'Uses only the verified business category; no unverified business claim is made.',
        evidenceUsed: evidenceFact ? [evidenceFact] : [`Verified category: ${niche}`],
        confidence: evidenceFact ? 'MEDIUM' : 'LOW',
      },
      isAiGenerated: false,
    };
    }

    const { systemInstruction, userPrompt } = buildOutreachDraftPrompt(options);

    try {
      const validated = await generateGeminiJson(
        { systemInstruction, userPrompt, temperature: 0.4, maxOutputTokens: 2_048 },
        (value) => OutreachDraftSchema.parse(value),
      );
      const evidenceText = options.evidence.map((item) => `${item?.claim || ''} ${item?.evidence || ''}`).join(' ').toLowerCase();
      const unsupportedEvidence = validated.evidenceUsed.some((item) => {
        const text = String(item).toLowerCase();
        return text && !evidenceText.includes(text) && !options.leadInfo.niche.toLowerCase().includes(text);
      });
      if (unsupportedEvidence) throw new Error('Generated draft cited unsupported evidence.');

      return { draft: validated, isAiGenerated: true };
    } catch (err) {
      console.error('Failed to generate outreach draft with Gemini:', err);
      return {
        draft: {
          channel: 'INSTAGRAM_DM',
          messageBody: 'I cannot safely draft a personalized message from the available verified information. A human operator should review this lead before any outreach.',
          personalizationReason: 'Safe fallback after AI failure; no unverified claim is introduced.',
          evidenceUsed: [],
          confidence: 'LOW',
        },
        isAiGenerated: false,
      };
    }
  }

  static async extractLearning(options: {
    conversationText: string;
    leadInfo: any;
    outcome?: string;
  }): Promise<{ learning: LearningExtractionResult | null; isAiGenerated: boolean }> {
    const ai = getGeminiClient();
    if (!ai) return { learning: null, isAiGenerated: false };

    const { systemInstruction, userPrompt } = buildLearningExtractionPrompt(options);

    try {
      const validated = await generateGeminiJson(
        { systemInstruction, userPrompt, temperature: 0.2, maxOutputTokens: 2_048 },
        (value) => LearningExtractionSchema.parse(value),
      );

      if (validated.learning === 'NO_GENERALIZABLE_LEARNING') {
        return { learning: null, isAiGenerated: true };
      }

      return { learning: validated, isAiGenerated: true };
    } catch (err) {
      console.error('Failed to extract learning with Gemini:', err);
      return { learning: null, isAiGenerated: false };
    }
  }

  /**
   * Phase 1 (P1) — optional AI classification of publicly available business information.
   *
   * Only a size-capped, script-free visible text extract (plus deterministic crawler facts) is sent
   * to Gemini. The response is Zod-validated and then passed through `verifyQuotedResearchProfile`,
   * which drops any value that is not backed by verbatim page text. When no key is configured or the
   * call fails, nothing is invented: a warning is returned and the audit facts stand alone.
   */
  static async summarizeBusinessProfile(options: {
    sourceUrl: string;
    pageTitle: string | null;
    metaDescription: string | null;
    deterministicFacts: string[];
    pageTextExtract: string | null;
  }): Promise<{
    profile: BusinessResearchProfile | null;
    isAiGenerated: boolean;
    dropped: string[];
    warning?: string;
  }> {
    const extract = (options.pageTextExtract || '').trim();
    if (!extract) {
      return {
        profile: null,
        isAiGenerated: false,
        dropped: [],
        warning: 'No readable page text was available; AI classification was skipped.',
      };
    }

    const ai = getGeminiClient();
    if (!ai) {
      return {
        profile: null,
        isAiGenerated: false,
        dropped: [],
        warning: 'Gemini API key not configured. Only deterministic website facts were collected.',
      };
    }

    const { systemInstruction, userPrompt } = buildBusinessResearchPrompt({
      sourceUrl: options.sourceUrl,
      pageTitle: options.pageTitle,
      metaDescription: options.metaDescription,
      deterministicFacts: options.deterministicFacts,
      pageTextExtract: extract,
    });

    try {
      const validated = await generateGeminiJson(
        { systemInstruction, userPrompt, temperature: 0.1, maxOutputTokens: 2_048 },
        (value) => BusinessResearchProfileSchema.parse(value),
      );
      const { profile, dropped } = verifyQuotedResearchProfile(validated, {
        pageExtract: extract,
        deterministicFacts: options.deterministicFacts,
      });

      return {
        profile,
        isAiGenerated: true,
        dropped,
        warning: dropped.length > 0
          ? `${dropped.length} unverifiable AI claim(s) were discarded: ${dropped.join('; ')}`
          : undefined,
      };
    } catch (err: any) {
      console.error('Gemini business research classification error:', err);
      return {
        profile: null,
        isAiGenerated: false,
        dropped: [],
        warning: `AI business classification failed (${err?.message || 'Gemini error'}). Only deterministic website facts were collected.`,
      };
    }
  }

  // Heuristic baseline compliant with strict No-Invention rule
  private static heuristicAnalyze(
    text: string,
    source: string,
    externalId: string
  ): ConversationAnalysis {
    const lower = text.toLowerCase();

    // Intent detection
    let intent: any = 'UNKNOWN';
    let intentReason = 'No definitive buying signals detected in conversation text.';
    let intentConfidence: any = 'LOW';
    const evidenceList: any[] = [];

    const interestSignals = [
      'how much', 'cost', 'pricing', 'quote', 'timeline', 'turnaround',
      'mindbody', 'redesign', 'build us a website', 'portfolio', 'rates',
      'available to talk', 'schedule a call', 'lets do it', 'proposal'
    ];

    const rejectionSignals = [
      'not interested', 'stop messaging', 'already have someone',
      'too expensive', 'no thanks', 'remove me', 'scam', 'spam'
    ];

    const matchesInterest = interestSignals.filter((kw) => lower.includes(kw));
    const matchesRejection = rejectionSignals.filter((kw) => lower.includes(kw));

    if (matchesRejection.length > 0) {
      intent = 'NOT_INTERESTED';
      intentReason = `Contact expressed explicit hesitation or disinterest matching keyword(s): ${matchesRejection.join(', ')}.`;
      intentConfidence = 'HIGH';
    } else if (matchesInterest.length >= 2) {
      intent = 'INTERESTED';
      intentReason = `Contact asked specific commercial/project questions regarding: ${matchesInterest.join(', ')}.`;
      intentConfidence = 'HIGH';
    } else if (matchesInterest.length === 1) {
      intent = 'POSSIBLY_INTERESTED';
      intentReason = `Contact made an exploratory inquiry regarding: ${matchesInterest[0]}.`;
      intentConfidence = 'MEDIUM';
    } else if (text.trim().length > 0) {
      intent = 'NEUTRAL';
      intentReason = 'Initial message exchange without clear commitment or buying signals.';
      intentConfidence = 'MEDIUM';
    }

    // Niche detection
    let niche: any = 'UNKNOWN';
    if (lower.includes('gym') || lower.includes('fitness') || lower.includes('workout') || lower.includes('crossfit') || lower.includes('trainer')) {
      niche = 'Gym';
    } else if (lower.includes('restaurant') || lower.includes('cafe') || lower.includes('menu') || lower.includes('chef') || lower.includes('food') || lower.includes('dining')) {
      niche = 'Restaurant';
    } else if (lower.includes('salon') || lower.includes('hair') || lower.includes('spa') || lower.includes('aesthetic') || lower.includes('stylist')) {
      niche = 'Salon';
    } else if (lower.includes('coach') || lower.includes('consulting') || lower.includes('advisor')) {
      niche = 'Coaching';
    } else if (lower.includes('contractor') || lower.includes('builder') || lower.includes('renovation') || lower.includes('clinic')) {
      niche = 'Local business';
    } else if (lower.includes('fleet') || lower.includes('b2b') || lower.includes('logistics')) {
      niche = 'Service business';
    } else if (lower.includes('creator') || lower.includes('youtube') || lower.includes('podcast')) {
      niche = 'Creator';
    } else if (lower.includes('saas') || lower.includes('startup') || lower.includes('platform')) {
      niche = 'Startup';
    }

    // Qualification
    let qualification: any = 'PENDING_INFO';
    let qualificationReason = 'Insufficient data to verify business identity and project scope.';

    if (intent === 'NOT_INTERESTED') {
      qualification = 'DISQUALIFIED';
      qualificationReason = 'Contact confirmed they are not seeking web services.';
    } else if (niche !== 'UNKNOWN' && (intent === 'INTERESTED' || intent === 'POSSIBLY_INTERESTED')) {
      qualification = 'QUALIFIED';
      qualificationReason = `Identified legitimate business in the ${niche} niche with active interest signals.`;
    }

    // Portfolio match
    const portfolioCategory = niche !== 'UNKNOWN' ? niche : 'NO_MATCH';
    const portfolioMatchReason = portfolioCategory !== 'NO_MATCH'
      ? `Matched based on business niche: ${portfolioCategory}.`
      : 'No verified D Web Studio portfolio category matched.';

    // Extract quote for evidence if available
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length > 0) {
      evidenceList.push({
        claim: 'Conversation activity recorded',
        evidence: lines[0].slice(0, 150),
        source: source,
        confidence: 'high',
      });
    }

    return {
      businessInfo: {
        businessName: 'UNKNOWN',
        personName: 'UNKNOWN',
        instagramUsername: source === 'INSTAGRAM' ? externalId : null,
        phone: null,
        email: null,
        location: 'UNKNOWN',
        website: 'UNKNOWN',
        niche,
      },
      conversationSummary: lines.slice(0, 3).join(' ').slice(0, 300) || 'Conversation imported from source.',
      intent,
      intentReason,
      intentConfidence,
      qualification,
      qualificationReason,
      offerDiscussed: null,
      priceDiscussed: null,
      objections: [],
      importantMessages: lines.slice(0, 2),
      followUpNeeded: intent === 'INTERESTED' || intent === 'POSSIBLY_INTERESTED',
      followUpReason: intent === 'INTERESTED' ? 'Follow up with portfolio and scheduling link.' : null,
      portfolioCategory,
      portfolioMatchReason,
      suggestedNextAction: intent === 'INTERESTED'
        ? `Send personalized portfolio link for ${portfolioCategory} case study.`
        : 'Gather more information on business requirements.',
      evidenceList,
    };
  }
}
