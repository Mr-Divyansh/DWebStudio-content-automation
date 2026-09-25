import { z } from 'zod';

export const IntentEnum = z.enum([
  'INTERESTED',
  'POSSIBLY_INTERESTED',
  'NEUTRAL',
  'NOT_INTERESTED',
  'NO_RESPONSE',
  'UNKNOWN',
]);

export const QualificationEnum = z.enum([
  'QUALIFIED',
  'DISQUALIFIED',
  'PENDING_INFO',
]);

export const ConfidenceEnum = z.enum([
  'HIGH',
  'MEDIUM',
  'LOW',
]);

export const EvidenceItemSchema = z.object({
  claim: z.string().describe('The factual claim made about the lead or conversation'),
  evidence: z.string().describe('The verbatim quote from the conversation supporting the claim'),
  source: z.string().default('Conversation'),
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
});

export const ConversationAnalysisSchema = z.object({
  businessInfo: z.object({
    businessName: z.string().default('UNKNOWN'),
    personName: z.string().default('UNKNOWN'),
    instagramUsername: z.string().nullable().default(null),
    phone: z.string().nullable().default(null),
    email: z.string().nullable().default(null),
    location: z.string().default('UNKNOWN'),
    website: z.string().default('UNKNOWN'),
    niche: z.enum([
      'Gym',
      'Restaurant',
      'Salon',
      'Coaching',
      'Local business',
      'Service business',
      'Creator',
      'Startup',
      'UNKNOWN',
    ]).default('UNKNOWN'),
  }),
  conversationSummary: z.string().describe('Factual 2-3 sentence summary of the conversation.'),
  intent: IntentEnum,
  intentReason: z.string().describe('Reasoning for the intent classification based strictly on message facts.'),
  intentConfidence: ConfidenceEnum,
  qualification: QualificationEnum,
  qualificationReason: z.string().describe('Reasoning for qualification based on verified business identity and service fit.'),
  offerDiscussed: z.string().nullable().default(null),
  priceDiscussed: z.string().nullable().default(null),
  objections: z.array(z.string()).default([]),
  importantMessages: z.array(z.string()).default([]),
  followUpNeeded: z.boolean().default(false),
  followUpReason: z.string().nullable().default(null),
  portfolioCategory: z.enum([
    'Gym',
    'Restaurant',
    'Salon',
    'Coaching',
    'Local business',
    'Service business',
    'Creator',
    'Startup',
    'NO_MATCH',
  ]).default('NO_MATCH'),
  portfolioMatchReason: z.string().describe('Why this portfolio project matches or why NO_MATCH was chosen.'),
  suggestedNextAction: z.string().describe('Recommended next concrete action for human sales operator.'),
  evidenceList: z.array(EvidenceItemSchema).default([]),
});

export type ConversationAnalysis = z.infer<typeof ConversationAnalysisSchema>;

export const ConversationStageEnum = z.enum([
  'NEW',
  'QUALIFYING',
  'INTERESTED',
  'REQUIREMENTS',
  'PRICING',
  'NEGOTIATION',
  'READY_TO_BUY',
  'FOLLOW_UP',
  'HUMAN_REQUIRED',
  'CLOSED',
  'NOT_INTERESTED',
]);

export interface LeadDiscoverySignals {
  hasBooking: boolean | null;
  hasContact: boolean | null;
  hasViewport: boolean | null;
  missingAltRatio: number | null;
  responseTimeMs: number | null;
  socialPlatforms: string[];
}

export const LeadDiscoverySignalSchema = z.object({
  hasBooking: z.boolean().nullable(),
  hasContact: z.boolean().nullable(),
  hasViewport: z.boolean().nullable(),
  missingAltRatio: z.number().min(0).max(1).nullable(),
  responseTimeMs: z.number().nonnegative().nullable(),
  socialPlatforms: z.array(z.string()).default([]),
});

export const ReplyAnalysisSchema = z.object({
  stage: ConversationStageEnum,
  intent: IntentEnum,
  confidence: ConfidenceEnum,
  evidence: z.array(z.string()).default([]),
  reason: z.string(),
  needsHuman: z.boolean().default(false),
  needsRequirements: z.boolean().default(false),
  asksPricing: z.boolean().default(false),
  purchaseIntent: z.boolean().default(false),
  objection: z.string().nullable().default(null),
  suggestedNextAction: z.string(),
});

export type ReplyAnalysis = z.infer<typeof ReplyAnalysisSchema>;

/** Phase 1 (P1/P2) — research evidence item produced by the public website audit (deterministic) or
 * by the optional AI classification step. Every item stays traceable to a source URL + fetch time.
 */
export const ResearchEvidenceItemSchema = z.object({
  claim: z.string().describe('Short factual label, e.g. "HTTPS" or "Booking link".'),
  observation: z.string().describe('The observable statement, e.g. "Booking link detected: no".'),
  sourceUrl: z.string(),
  fetchedAt: z.string(),
  evidenceType: z.enum([
    'OBSERVED_FACT',
    'OBSERVED_ABSENCE',
    'UNREACHABLE',
    'NOT_EVALUATED',
    'AI_INFERENCE',
  ]),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type ResearchEvidenceItem = z.infer<typeof ResearchEvidenceItemSchema>;

/**
 * AI classification of publicly available business information.
 * STRICT NO-INVENTION CONTRACT: every non-null field MUST be supported by a verbatim quote copied
 * from the supplied page extract. Those quotes are verified deterministically in
 * `ConversationAnalyzer.summarizeBusinessProfile` — any field whose quote cannot be found verbatim
 * in the page text is discarded (set to null) before anything is stored or shown.
 */
export const BusinessResearchProfileSchema = z.object({
  businessName: z.string().nullable().default(null),
  businessType: z.string().nullable().default(null),
  category: z.enum([
    'Gym',
    'Restaurant',
    'Salon',
    'Coaching',
    'Local business',
    'Service business',
    'Creator',
    'Startup',
    'UNKNOWN',
  ]).default('UNKNOWN'),
  services: z.array(z.object({
    name: z.string(),
    evidenceQuote: z.string(),
  })).default([]),
  location: z.string().nullable().default(null),
  publicEmail: z.string().nullable().default(null),
  publicPhone: z.string().nullable().default(null),
  bookingFlow: z.string().nullable().default(null),
  observations: z.array(z.object({
    observation: z.string(),
    evidenceQuote: z.string(),
  })).default([]),
  confidence: ConfidenceEnum,
  insufficientEvidence: z.boolean().default(true),
});

export type BusinessResearchProfile = z.infer<typeof BusinessResearchProfileSchema>;

export const OutreachDraftSchema = z.object({
  channel: z.enum(['INSTAGRAM_DM', 'WHATSAPP', 'EMAIL']).default('INSTAGRAM_DM'),
  messageBody: z.string().describe('The personalized, concise outreach message draft.'),
  personalizationReason: z.string().describe('Why this message is tailored to this specific lead.'),
  evidenceUsed: z.array(z.string()).describe('List of verified facts from the conversation used in the message.'),
  confidence: ConfidenceEnum,
});

export type OutreachDraftResult = z.infer<typeof OutreachDraftSchema>;

export const LearningExtractionSchema = z.object({
  learning: z.string().describe('A concrete, actionable lesson or pattern observed in this conversation.'),
  type: z.enum([
    'OBJECTION_PATTERN',
    'PRICING_SIGNAL',
    'NICHE_BEHAVIOR',
    'SUCCESS_FACTOR',
    'REJECTION_REASON',
  ]),
  evidence: z.array(z.string()).describe('Verbatim message quotes illustrating this learning.'),
  confidence: ConfidenceEnum,
  appliesTo: z.string().describe('Specific niche (e.g. Gym, Restaurant) or "All"'),
});

export type LearningExtractionResult = z.infer<typeof LearningExtractionSchema>;
