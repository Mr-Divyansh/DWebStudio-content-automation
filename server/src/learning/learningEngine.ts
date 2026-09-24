import { LearningRepository } from '../database/repositories/learningRepository.js';
import { CorrectionRepository } from '../database/repositories/correctionRepository.js';
import { LeadRepository } from '../database/repositories/leadRepository.js';

export class LearningEngine {
  static async getContextForAnalysis(niche?: string) {
    const records = await LearningRepository.findRelevant(niche, 6);
    return records.map((r) => ({
      learning: r.learning,
      type: r.type,
      appliesTo: r.appliesTo,
    }));
  }

  static async recordUserCorrection(params: {
    leadId: string;
    field: string;
    originalValue: string;
    correctedValue: string;
    userReason?: string;
  }) {
    // 1. Store the correction audit
    const correction = await CorrectionRepository.create(params);

    // 2. Update the lead field directly
    const updateData: any = {};
    if (params.field === 'intent') {
      updateData.intent = params.correctedValue;
      if (params.correctedValue === 'NOT_INTERESTED') {
        updateData.status = 'REJECTED';
      } else if (params.correctedValue === 'INTERESTED') {
        updateData.status = 'INTERESTED';
      }
    } else if (params.field === 'status') {
      updateData.status = params.correctedValue;
    } else if (params.field === 'qualification') {
      updateData.qualification = params.correctedValue;
      if (params.correctedValue === 'DISQUALIFIED') {
        updateData.status = 'REJECTED';
      }
    } else if (params.field === 'portfolioMatch') {
      updateData.portfolioMatch = params.correctedValue;
    } else if (params.field === 'niche') {
      updateData.niche = params.correctedValue;
    }

    const lead = await LeadRepository.update(params.leadId, updateData);

    // 3. If user provided a rationale, formulate a persistent structured learning
    if (params.userReason && params.userReason.trim().length > 10) {
      await LearningRepository.create({
        learning: `User correction for ${lead.niche || 'General'} lead: "${params.userReason.trim()}". Changed ${params.field} from ${params.originalValue} to ${params.correctedValue}.`,
        type: params.field === 'intent' ? 'REJECTION_REASON' : 'SUCCESS_FACTOR',
        evidence: [
          `Original: ${params.originalValue}`,
          `Corrected: ${params.correctedValue}`,
          `Reason: ${params.userReason.trim()}`,
        ],
        confidence: 'HIGH',
        appliesTo: lead.niche && lead.niche !== 'UNKNOWN' ? lead.niche : 'All',
        source: 'USER_CORRECTION',
        relatedLeadId: params.leadId,
      });
    }

    return { correction, lead };
  }
}
