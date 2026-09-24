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
} from '../types';

export const api = {
  // Config & Health
  async getConfig(): Promise<ConfigInfo> {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('Failed to fetch config');
    return res.json();
  },

  // Dashboard
  async getDashboard(): Promise<DashboardStats> {
    const res = await fetch('/api/dashboard');
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
};
