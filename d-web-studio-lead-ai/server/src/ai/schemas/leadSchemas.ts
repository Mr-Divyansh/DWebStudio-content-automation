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
