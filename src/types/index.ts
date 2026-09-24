export type LeadStatus =
  | 'NEW'
  | 'RESEARCHING'
  | 'QUALIFIED'
  | 'REJECTED'
  | 'DRAFTED'
  | 'SENT'
  | 'REPLIED'
  | 'INTERESTED'
  | 'HANDOFF'
  | 'CLOSED';

export type LeadIntent =
  | 'INTERESTED'
  | 'POSSIBLY_INTERESTED'
  | 'NEUTRAL'
  | 'NOT_INTERESTED'
  | 'NO_RESPONSE'
  | 'UNKNOWN';

export type QualificationStatus = 'QUALIFIED' | 'DISQUALIFIED' | 'PENDING_INFO';

export interface EvidenceItem {
  claim: string;
  evidence: string;
  source: string;
  confidence: 'high' | 'medium' | 'low';
  // Phase 1 (P1) research evidence metadata (null for conversation-derived evidence).
  sourceUrl?: string | null;
  observation?: string | null;
  fetchedAt?: string | null;
  evidenceType?: ResearchEvidenceType | null;
}

export type ResearchEvidenceType =
  | 'OBSERVED_FACT'
  | 'OBSERVED_ABSENCE'
  | 'UNREACHABLE'
  | 'NOT_EVALUATED'
  | 'AI_INFERENCE';

export type ResearchStatus =
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'NO_URL'
  | 'URL_REJECTED'
  | 'CACHED';

/** Phase 1 (P1) — one stored public research run. All fields nullable: unknown stays unknown. */
export interface BusinessResearchItem {
  id: string;
  leadId: string;
  targetUrl: string;
  finalUrl?: string | null;
  status: string;
  source: string;
  reachable: boolean;
  httpStatus?: number | null;
  statusText?: string | null;
  httpsAvailable?: boolean | null;
  httpsStatus?: number | null;
  httpsError?: string | null;
  responseTimeMs?: number | null;
  redirectCount: number;
  title?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  language?: string | null;
  viewportMetaPresent?: boolean | null;
  viewportMetaContent?: string | null;
  h1Count?: number | null;
  h1Text?: string | null;
  imageCount?: number | null;
  imagesMissingAlt?: number | null;
  robotsTxtPresent?: boolean | null;
  bookingLinkDetected?: boolean | null;
  bookingLinks?: string | null;
  contactLinkDetected?: boolean | null;
  contactLinks?: string | null;
  emailLinks?: string | null;
  phoneLinks?: string | null;
  socialLinks?: string | null;
  structuredDataTypes?: string | null;
  businessName?: string | null;
  businessType?: string | null;
  category?: string | null;
  location?: string | null;
  publicEmail?: string | null;
  publicPhone?: string | null;
  services?: string | null;
  observations?: string | null;
  /** Phase 3 (P3): true when the response was an access/bot-protection page (403 etc.). */
  blocked?: boolean | null;
  aiSummaryUsed: boolean;
  aiConfidence?: string | null;
  warnings?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Phase 1 (P1) — response of POST /api/leads/:id/research. */
export interface LeadResearchOutcome {
  status: ResearchStatus;
  targetUrl: string | null;
  cached: boolean;
  research: BusinessResearchItem | null;
  evidence: Array<{
    claim: string;
    observation: string;
    sourceUrl: string;
    fetchedAt: string;
    evidenceType: ResearchEvidenceType;
    confidence: 'high' | 'medium' | 'low';
  }>;
  unknowns: string[];
  warnings: string[];
  errors: Array<{ code: string; message: string }>;
  isAiGenerated: boolean;
}

/* Phase 3 (P3) — deterministic, evidence-based qualification types. */
export type LeadQualificationStatus = 'QUALIFIED' | 'NOT_QUALIFIED' | 'NEEDS_REVIEW';
export type LeadQualificationConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type QualificationReasonType =
  | 'EXPLICIT_REQUEST'
  | 'OBSERVATION'
  | 'EXCLUSION'
  | 'CONFLICT'
  | 'MISSING_DATA';

export interface QualificationReason {
  ruleId: string;
  type: QualificationReasonType;
  reason: string;
  evidenceIds: string[];
}

export interface PortfolioMatchItem {
  project: { id: string; title: string; category: string; liveUrl: string | null } | null;
  reason: string;
  confidence: LeadQualificationConfidence;
}

/** Response of POST /api/leads/:id/qualify. */
export interface LeadQualificationOutcome {
  id?: string;
  status: LeadQualificationStatus;
  confidence: LeadQualificationConfidence;
  reasons: QualificationReason[];
  portfolioMatch: PortfolioMatchItem;
  nextAction: string;
  ruleTrace?: Array<{ ruleId: string; fired: boolean; note: string }>;
  evidence?: Array<{ id: string; sourceUrl: string | null; observation: string | null; fetchedAt: string | null }>;
  researchCount?: number;
  cached?: boolean;
}

/** Row of GET /api/leads/:id/qualification (stored history). */
export interface LeadQualificationItem {
  id: string;
  leadId: string;
  status: string;
  confidence: string;
  reasons: string;
  portfolioMatch: string;
  nextAction: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageItem {
  id: string;
  conversationId: string;
  sender: string;
  senderType: 'USER' | 'CLIENT' | 'UNKNOWN';
  content: string;
  timestamp: string;
}

export interface ConversationItem {
  id: string;
  externalId: string;
  source: string;
  title: string;
  participantNames?: string;
  messageCount: number;
  messages: MessageItem[];
}

export interface OutreachDraftItem {
  id: string;
  leadId: string;
  channel: string;
  subject?: string;
  messageBody: string;
  personalizationReason?: string;
  evidenceUsed?: string;
  confidence: string;
  status: 'DRAFTED' | 'APPROVED' | 'REJECTED' | 'SENT';
  approvedAt?: string;
  createdAt: string;
  lead?: {
    businessName: string;
    niche: string;
  };
}

export interface AnalysisItem {
  id: string;
  leadId?: string;
  intent: string;
  intentReason?: string;
  intentConfidence: string;
  qualification: string;
  qualificationReason?: string;
  objections?: string;
  portfolioMatched: string;
  suggestedAction?: string;
  evidenceList?: string;
  createdAt: string;
}

export interface CorrectionItem {
  id: string;
  leadId: string;
  field: string;
  originalValue: string;
  correctedValue: string;
  userReason?: string;
  createdAt: string;
  lead?: {
    id: string;
    businessName: string;
    niche: string;
  };
}

export interface LeadItem {
  id: string;
  businessName: string;
  personName: string;
  instagramUsername?: string | null;
  phone?: string | null;
  email?: string | null;
  location: string;
  website: string;
  niche: string;
  source: string;
  sourceConversationId?: string | null;
  conversationSummary?: string | null;
  intent: LeadIntent;
  interestLevel: string;
  status: LeadStatus;
  qualification: QualificationStatus;
  qualificationReason?: string | null;
  offerDiscussed?: string | null;
  priceDiscussed?: string | null;
  objections?: string | null;
  importantMessages?: string | null;
  followUpNeeded: boolean;
  followUpReason?: string | null;
  portfolioMatch: string;
  suggestedNextAction?: string | null;
  confidence: string;
  evidence?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  conversations?: ConversationItem[];
  analyses?: AnalysisItem[];
  corrections?: CorrectionItem[];
  outreachDrafts?: OutreachDraftItem[];
  evidenceItems?: EvidenceItem[];
  researchRecords?: BusinessResearchItem[];
  qualifications?: LeadQualificationItem[];
}

export interface LearningItem {
  id: string;
  learning: string;
  type: string;
  evidence?: string | null;
  confidence: string;
  appliesTo: string;
  source: string;
  createdAt: string;
  relatedLead?: {
    id: string;
    businessName: string;
    niche: string;
  } | null;
}

export interface ImportItem {
  id: string;
  source: string;
  fileName: string;
  filePath?: string | null;
  status: string;
  filesDiscovered: number;
  supportedFiles: number;
  unsupportedFiles: number;
  conversationCount: number;
  messageCount: number;
  leadCount: number;
  errors?: string | null;
  createdAt: string;
}

export interface PortfolioProjectItem {
  id: string;
  title: string;
  category: string;
  description: string;
  technologies?: string;
  results?: string;
  liveUrl?: string;
  keyFeatures?: string;
}

export interface DashboardStats {
  total: number;
  newLeads: number;
  qualified: number;
  interested: number;
  rejected: number;
  followUps: number;
  closed: number;
  niches: Array<{ niche: string; count: number }>;
  intents: Array<{ intent: string; count: number }>;
  sources: Array<{ source: string; count: number }>;
  recentLeads: Array<{
    id: string;
    businessName: string;
    personName: string;
    niche: string;
    source: string;
    status: LeadStatus;
    intent: LeadIntent;
    updatedAt: string;
    followUpNeeded: boolean;
    suggestedNextAction?: string;
  }>;
  recentDrafts: OutreachDraftItem[];
  recentLearnings: LearningItem[];
}

export interface ConfigInfo {
  system: string;
  version: string;
  geminiConfigured: boolean;
  mode: 'AI_ACTIVE' | 'DEMO_MODE';
  databaseConnected: boolean;
  databaseError?: string;
  instagramExportFolder: string;
  discoveredZips: string[];
}
