import {
  LeadItem,
  DashboardStats,
  ImportItem,
  LearningItem,
  CorrectionItem,
  PortfolioProjectItem,
  ConfigInfo,
  LeadResearchOutcome,
  BusinessResearchItem,
  LeadQualificationOutcome,
  LeadQualificationItem,
  AgentStatus,
  AgentEventItem,
  OutboundMessageItem,
  AgentLearningItem,
  PricingRuleItem,
  InboundMessageItem,
  MessagingSettings,
  AgentSetupReport,
  AiTrainingReport,
  AiActivationResult,
  VaultKeyStatus,
} from '../types';

export const api = {
  // Config & Health
  async getConfig(): Promise<ConfigInfo> {
    const res = await fetch('/api/config', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch config');
    return res.json();
  },

  async getAuthSession(): Promise<{ authenticated: boolean; required: boolean; configured: boolean }> {
    const res = await fetch('/api/auth/session', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to read session');
    return res.json();
  },

  async login(password: string): Promise<{ success: boolean; required: boolean }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Login failed');
    return body;
  },

  async logout(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  },

  // Dashboard
  async getDashboard(): Promise<DashboardStats> {
    const res = await fetch('/api/dashboard', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch dashboard metrics');
    return res.json();
  },

  // Leads
  async getLeads(params: {
    status?: string;
    intent?: string;
    niche?: string;
    source?: string;
    search?: string;
    followUpOnly?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ total: number; leads: LeadItem[] }> {
    const query = new URLSearchParams();
    if (params.status && params.status !== 'ALL') query.set('status', params.status);
    if (params.intent && params.intent !== 'ALL') query.set('intent', params.intent);
    if (params.niche && params.niche !== 'ALL') query.set('niche', params.niche);
    if (params.source && params.source !== 'ALL') query.set('source', params.source);
    if (params.search) query.set('search', params.search);
    if (params.followUpOnly) query.set('followUpOnly', 'true');
    if (params.limit) query.set('limit', String(params.limit));
    if (params.offset) query.set('offset', String(params.offset));

    const res = await fetch(`/api/leads?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch leads');
    return res.json();
  },

  async getLeadById(id: string): Promise<LeadItem> {
    const res = await fetch(`/api/leads/${id}`);
    if (!res.ok) throw new Error(`Failed to fetch lead ${id}`);
    return res.json();
  },

  async updateLead(id: string, data: Partial<LeadItem>): Promise<LeadItem> {
    const res = await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update lead');
    return res.json();
  },

  async deleteLead(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete lead');
    return res.json();
  },

  async analyzeLead(id: string): Promise<any> {
    const res = await fetch(`/api/leads/${id}/analyze`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to analyze lead');
    }
    return res.json();
  },

  async draftMessage(id: string): Promise<any> {
    const res = await fetch(`/api/leads/${id}/draft-message`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to draft outreach message');
    }
    return res.json();
  },

  async approveDraft(leadId: string, draftId: string): Promise<any> {
    const res = await fetch(`/api/leads/${leadId}/approve-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId }),
    });
    if (!res.ok) throw new Error('Failed to approve draft');
    return res.json();
  },

  /**
   * Phase 1 (P1) — public web research for one lead (human triggered).
   * Only a public URL plus flags are sent; no internal fetch options are ever transmitted.
   */
  async researchLead(
    id: string,
    body: { url?: string; force?: boolean; useAi?: boolean } = {},
  ): Promise<LeadResearchOutcome> {
    const res = await fetch(`/api/leads/${id}/research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to run public research');
    }
    return res.json();
  },

  async getLeadResearch(id: string): Promise<BusinessResearchItem[]> {
    const res = await fetch(`/api/leads/${id}/research`);
    if (!res.ok) throw new Error('Failed to fetch stored research');
    return res.json();
  },

  /**
   * Phase 3 (P3) — deterministic qualification for one lead (human triggered).
   * Evaluates stored research/evidence only; it never contacts or messages the business.
   */
  async qualifyLead(id: string, body: { force?: boolean } = {}): Promise<LeadQualificationOutcome> {
    const res = await fetch(`/api/leads/${id}/qualify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to run qualification');
    }
    return res.json();
  },

  async getLeadQualifications(id: string): Promise<LeadQualificationItem[]> {
    const res = await fetch(`/api/leads/${id}/qualification`);
    if (!res.ok) throw new Error('Failed to fetch qualification history');
    return res.json();
  },

  /* ------------------------------------------------------ Autonomous agent */

  async getAgentStatus(): Promise<AgentStatus> {
    const res = await fetch('/api/agent/status');
    if (!res.ok) throw new Error('Failed to fetch agent status');
    return res.json();
  },

  async startAgent(): Promise<AgentStatus> {
    const res = await fetch('/api/agent/start', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to start agent');
    return res.json();
  },

  async pauseAgent(): Promise<AgentStatus> {
    const res = await fetch('/api/agent/pause', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to pause agent');
    return res.json();
  },

  async stopAgent(): Promise<AgentStatus> {
    const res = await fetch('/api/agent/stop', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to stop agent');
    return res.json();
  },

  async setAutoDm(enabled: boolean): Promise<AgentStatus> {
    const res = await fetch('/api/agent/auto-dm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error('Failed to update AUTO DM');
    return res.json();
  },

  /** The single ON/OFF switch for the whole AI. */
  async setAgentEnabled(enabled: boolean): Promise<AgentStatus> {
    const res = await fetch('/api/agent/enabled', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error('Failed to switch the AI on or off');
    return res.json();
  },

  /**
   * Real readiness checklist. Returns environment variable NAMES only, so the UI
   * can tell the owner exactly which keys are still missing without ever
   * receiving a secret value.
   */
  async getAgentSetup(): Promise<AgentSetupReport> {
    const res = await fetch('/api/agent/setup');
    if (!res.ok) throw new Error('Failed to fetch AI setup status');
    return res.json();
  },

  /** Trains the AI on owner-authored portfolio + pricing knowledge (idempotent). */
  async trainAgent(): Promise<AiTrainingReport> {
    const res = await fetch('/api/agent/setup/train', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to train the AI');
    }
    return res.json();
  },

  /** One press: train when needed, then switch the AI ON. */
  async activateAgent(): Promise<AiActivationResult> {
    const res = await fetch('/api/agent/setup/activate', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to switch the AI on');
    }
    return res.json();
  },

  /** One press: switch the AI OFF and disable AUTO DM. */
  async deactivateAgent(): Promise<AiActivationResult> {
    const res = await fetch('/api/agent/setup/deactivate', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to switch the AI off');
    }
    return res.json();
  },

  async runAgentTick(): Promise<any> {
    const res = await fetch('/api/agent/tick', { method: 'POST' });
    if (!res.ok) throw new Error('Agent tick failed');
    return res.json();
  },

  async getInboundMessages(limit = 30): Promise<InboundMessageItem[]> {
    const res = await fetch(`/api/agent/inbox?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch inbound messages');
    return res.json();
  },

  /** Full provider/account/webhook readiness for the settings panel. */
  async getMessagingSettings(): Promise<MessagingSettings> {
    const res = await fetch('/api/agent/messaging');
    if (!res.ok) throw new Error('Failed to fetch messaging settings');
    return res.json();
  },

  async getAgentActivity(limit = 30): Promise<AgentEventItem[]> {
    const res = await fetch(`/api/agent/activity?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch agent activity');
    return res.json();
  },

  async getOutboundMessages(limit = 30): Promise<OutboundMessageItem[]> {
    const res = await fetch(`/api/agent/messages?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch outbound log');
    return res.json();
  },

  async takeOverLead(id: string): Promise<any> {
    const res = await fetch(`/api/agent/leads/${id}/takeover`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to take over lead');
    return res.json();
  },

  async releaseLead(id: string): Promise<any> {
    const res = await fetch(`/api/agent/leads/${id}/release`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to release lead');
    return res.json();
  },

  async optOutLead(id: string): Promise<any> {
    const res = await fetch(`/api/agent/leads/${id}/opt-out`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to record opt-out');
    return res.json();
  },

  async getAgentLearnings(limit = 50): Promise<AgentLearningItem[]> {
    const res = await fetch(`/api/agent/learnings?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch learning events');
    return res.json();
  },

  async setLearningStatus(id: string, status: string): Promise<any> {
    const res = await fetch(`/api/agent/learnings/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Failed to update learning status');
    return res.json();
  },

  async getPricingRules(): Promise<PricingRuleItem[]> {
    const res = await fetch('/api/agent/pricing', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch pricing rules');
    return res.json();
  },

  async savePricingRule(rule: Partial<PricingRuleItem>): Promise<PricingRuleItem> {
    const res = await fetch('/api/agent/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save pricing rule');
    }
    return res.json();
  },

  // Imports
  async getImports(): Promise<ImportItem[]> {
    const res = await fetch('/api/import');
    if (!res.ok) throw new Error('Failed to fetch imports');
    return res.json();
  },

  async checkInstagramFolder(): Promise<{
    folderPath: string;
    zipFiles: string[];
    hasZip: boolean;
  }> {
    const res = await fetch('/api/import/instagram/check-folder');
    if (!res.ok) throw new Error('Failed to inspect Instagram export folder');
    return res.json();
  },

  async importInstagramZip(file?: File): Promise<any> {
    const formData = new FormData();
    if (file) {
      formData.append('zipFile', file);
    }
    const res = await fetch('/api/import/instagram', {
      method: 'POST',
      body: file ? formData : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Instagram import failed');
    }
    return res.json();
  },

  async importInstagramHtml(): Promise<any> {
    const res = await fetch('/api/import/instagram?mode=html', {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Instagram HTML import failed');
    }
    return res.json();
  },

  async importWhatsApp(chatText: string, title?: string): Promise<any> {
    const res = await fetch('/api/import/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatText, title }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'WhatsApp import failed');
    }
    return res.json();
  },

  async importCall(transcript: string, metadata?: { title?: string; callNotes?: string; durationMinutes?: number }): Promise<any> {
    const res = await fetch('/api/import/calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript,
        title: metadata?.title,
        callNotes: metadata?.callNotes,
        durationMinutes: metadata?.durationMinutes,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Call import failed');
    }
    return res.json();
  },

  // Learnings & Corrections
  async getLearnings(type?: string, appliesTo?: string): Promise<LearningItem[]> {
    const query = new URLSearchParams();
    if (type && type !== 'ALL') query.set('type', type);
    if (appliesTo && appliesTo !== 'ALL') query.set('appliesTo', appliesTo);

    const res = await fetch(`/api/learnings?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch learnings');
    return res.json();
  },

  async createLearning(data: {
    learning: string;
    type: string;
    confidence?: string;
    appliesTo?: string;
    evidence?: string[];
  }): Promise<LearningItem> {
    const res = await fetch('/api/learnings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create learning');
    return res.json();
  },

  async submitCorrection(data: {
    leadId: string;
    field: string;
    originalValue: string;
    correctedValue: string;
    userReason?: string;
  }): Promise<any> {
    const res = await fetch('/api/learnings/corrections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to submit user correction');
    return res.json();
  },

  async getCorrections(): Promise<CorrectionItem[]> {
    const res = await fetch('/api/learnings/corrections');
    if (!res.ok) throw new Error('Failed to fetch corrections');
    return res.json();
  },

  // Portfolio
  async getPortfolio(): Promise<PortfolioProjectItem[]> {
    const res = await fetch('/api/portfolio');
    if (!res.ok) throw new Error('Failed to fetch portfolio');
    return res.json();
  },

  // Owner secret vault (UI se API keys — values kabhi wapas nahi aati)
  async getVaultStatus(): Promise<{ keys: VaultKeyStatus[] }> {
    const res = await fetch('/api/vault/status', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to read saved keys');
    return res.json();
  },

  async saveVaultSecrets(secrets: Record<string, string>): Promise<{ saved: string[]; keys: VaultKeyStatus[] }> {
    const res = await fetch('/api/vault/save', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secrets }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Keys save nahi ho payi');
    return body;
  },
};
