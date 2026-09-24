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
