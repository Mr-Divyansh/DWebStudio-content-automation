import { Router } from 'express';
import { LeadService } from '../../services/leadService.js';

export const leadRouter = Router();

leadRouter.get('/', async (req, res) => {
  try {
    const { status, intent, niche, source, search, followUpOnly, limit, offset } = req.query;
    const result = await LeadService.getLeads({
      status: status as string,
      intent: intent as string,
      niche: niche as string,
      source: source as string,
      search: search as string,
      followUpOnly: followUpOnly === 'true',
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });
    res.json(result);
  } catch (err: any) {
    console.error('Error fetching leads:', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch leads' });
  }
});

leadRouter.get('/:id', async (req, res) => {
  try {
    const lead = await LeadService.getLeadById(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json(lead);
  } catch (err: any) {
    console.error('Error fetching lead:', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch lead' });
  }
});

leadRouter.patch('/:id', async (req, res) => {
  try {
    const updated = await LeadService.updateLead(req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    console.error('Error updating lead:', err);
    res.status(500).json({ error: err?.message || 'Failed to update lead' });
  }
});

leadRouter.delete('/:id', async (req, res) => {
  try {
    await LeadService.deleteLead(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting lead:', err);
    res.status(500).json({ error: err?.message || 'Failed to delete lead' });
  }
});

leadRouter.post('/:id/analyze', async (req, res) => {
  try {
    const result = await LeadService.runAnalysisOnLead(req.params.id);
    res.json(result);
  } catch (err: any) {
    console.error('Error analyzing lead:', err);
    res.status(500).json({ error: err?.message || 'Failed to analyze lead' });
  }
});

/**
 * Phase 1 (P1) — Public business research.
 *
 * Human-triggered only: this endpoint fetches public pages for ONE lead when a human asks for it.
 * It never scrapes private accounts, never sends messages, and never runs in a loop. Request bodies
 * may only contain a public URL plus two flags; no internal/test fetch options are accepted from the
 * client, so SSRF protections cannot be disabled through the API.
 */
leadRouter.post('/:id/research', async (req, res) => {
  try {
    const { url, force, useAi } = req.body ?? {};
    const result = await LeadService.runResearch(req.params.id, {
      url: typeof url === 'string' ? url : null,
      force: force === true,
      useAi: useAi === false ? false : undefined,
    });
    res.json(result);
  } catch (err: any) {
    console.error('Error researching lead:', err);
    res.status(500).json({ error: err?.message || 'Failed to run public research' });
  }
});

leadRouter.get('/:id/research', async (req, res) => {
  try {
    const result = await LeadService.getResearch(req.params.id);
    res.json(result);
  } catch (err: any) {
    console.error('Error fetching stored research:', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch research' });
  }
});

leadRouter.post('/:id/draft-message', async (req, res) => {
  try {
    const result = await LeadService.generateOutreachDraft(req.params.id);
    res.json(result);
  } catch (err: any) {
    console.error('Error drafting message:', err);
    res.status(500).json({ error: err?.message || 'Failed to draft outreach message' });
  }
});

leadRouter.post('/:id/approve-draft', async (req, res) => {
  try {
    const { draftId } = req.body;
    if (!draftId) {
      return res.status(400).json({ error: 'draftId is required' });
    }
    const result = await LeadService.approveDraft(draftId);
    res.json(result);
  } catch (err: any) {
    console.error('Error approving draft:', err);
    res.status(500).json({ error: err?.message || 'Failed to approve draft' });
  }
});
