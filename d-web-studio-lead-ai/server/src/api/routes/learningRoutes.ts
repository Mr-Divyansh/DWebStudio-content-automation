import { Router } from 'express';
import { LearningRepository } from '../../database/repositories/learningRepository.js';
import { CorrectionRepository } from '../../database/repositories/correctionRepository.js';
import { LearningEngine } from '../../learning/learningEngine.js';

export const learningRouter = Router();

learningRouter.get('/', async (req, res) => {
  try {
    const { type, appliesTo } = req.query;
    const learnings = await LearningRepository.findAll({
      type: type as string,
      appliesTo: appliesTo as string,
    });
    res.json(learnings);
  } catch (err: any) {
    console.error('Error fetching learnings:', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch learnings' });
  }
});

learningRouter.post('/', async (req, res) => {
  try {
    const { learning, type, evidence, confidence, appliesTo, source, relatedLeadId } = req.body;
    if (!learning || !type) {
      return res.status(400).json({ error: 'Learning text and type are required' });
    }

    const created = await LearningRepository.create({
      learning,
      type,
      evidence,
      confidence,
      appliesTo,
      source: source || 'MANUAL',
      relatedLeadId,
    });
    res.json(created);
  } catch (err: any) {
    console.error('Error creating learning:', err);
    res.status(500).json({ error: err?.message || 'Failed to create learning' });
  }
});

learningRouter.delete('/:id', async (req, res) => {
  try {
    await LearningRepository.delete(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting learning:', err);
    res.status(500).json({ error: err?.message || 'Failed to delete learning' });
  }
});

// User corrections
learningRouter.post('/corrections', async (req, res) => {
  try {
    const { leadId, field, originalValue, correctedValue, userReason } = req.body;
    if (!leadId || !field || originalValue === undefined || correctedValue === undefined) {
      return res.status(400).json({ error: 'Missing required correction fields' });
    }

    const result = await LearningEngine.recordUserCorrection({
      leadId,
      field,
      originalValue: String(originalValue),
      correctedValue: String(correctedValue),
      userReason,
    });

    res.json({
      success: true,
      message: 'Correction recorded and applied to lead intelligence memory',
      data: result,
    });
  } catch (err: any) {
    console.error('Error recording correction:', err);
    res.status(500).json({ error: err?.message || 'Failed to record correction' });
  }
});

learningRouter.get('/corrections', async (_req, res) => {
  try {
    const corrections = await CorrectionRepository.findAll();
    res.json(corrections);
  } catch (err: any) {
    console.error('Error fetching corrections:', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch corrections' });
  }
});
