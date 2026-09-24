import { LeadRepository, LeadFilterOptions } from '../database/repositories/leadRepository.js';
import { ConversationRepository } from '../database/repositories/conversationRepository.js';
import { PortfolioService } from './portfolioService.js';
import { ConversationAnalyzer } from '../ai/analyzer.js';
import { LearningEngine } from '../learning/learningEngine.js';
import { prisma } from '../database/client.js';

export class LeadService {
  static async getLeads(filters: LeadFilterOptions) {
    return LeadRepository.findAll(filters);
  }

  static async getLeadById(id: string) {
    return LeadRepository.findById(id);
  }

  static async updateLead(id: string, data: any) {
    return LeadRepository.update(id, data);
  }

  static async deleteLead(id: string) {
    return LeadRepository.delete(id);
  }

  static async getDashboardStats() {
    return LeadRepository.getStats();
  }

  static async runAnalysisOnLead(leadId: string) {
    const lead = await LeadRepository.findById(leadId);
    if (!lead) {
      throw new Error(`Lead with ID ${leadId} not found.`);
    }

    // Build aggregate transcript from attached conversations
    let fullTranscript = '';
    for (const conv of lead.conversations) {
      fullTranscript += `\n--- Conversation: ${conv.title} (${conv.source}) ---\n`;
      for (const msg of conv.messages) {
        fullTranscript += `[${msg.timestamp.toISOString()}] ${msg.sender} (${msg.senderType}): ${msg.content}\n`;
      }
    }

    if (!fullTranscript.trim()) {
      fullTranscript = `Lead: ${lead.businessName} (${lead.personName})\nSummary: ${lead.conversationSummary || 'No messages attached.'}`;
    }

    // Retrieve historical learnings for context
    const learningsContext = await LearningEngine.getContextForAnalysis(lead.niche);

    // Call AI analyzer
    const { analysis, isAiGenerated, warning } = await ConversationAnalyzer.analyzeConversation({
      conversationText: fullTranscript,
      source: lead.source,
      externalId: lead.instagramUsername || lead.sourceConversationId || lead.id,
      relevantLearnings: learningsContext,
    });

    // Check portfolio match
    const matchedPortfolio = await PortfolioService.matchByNiche(analysis.portfolioCategory);

    // Update Lead model
    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        businessName: analysis.businessInfo.businessName !== 'UNKNOWN' ? analysis.businessInfo.businessName : lead.businessName,
        personName: analysis.businessInfo.personName !== 'UNKNOWN' ? analysis.businessInfo.personName : lead.personName,
        location: analysis.businessInfo.location !== 'UNKNOWN' ? analysis.businessInfo.location : lead.location,
        website: analysis.businessInfo.website !== 'UNKNOWN' ? analysis.businessInfo.website : lead.website,
        niche: analysis.businessInfo.niche !== 'UNKNOWN' ? analysis.businessInfo.niche : lead.niche,
        conversationSummary: analysis.conversationSummary || lead.conversationSummary,
        intent: analysis.intent,
        interestLevel: analysis.intent === 'INTERESTED' ? 'HIGH' : analysis.intent === 'POSSIBLY_INTERESTED' ? 'MEDIUM' : 'LOW',
        status: analysis.intent === 'NOT_INTERESTED' ? 'REJECTED' : analysis.intent === 'INTERESTED' ? 'QUALIFIED' : lead.status,
        qualification: analysis.qualification,
        qualificationReason: analysis.qualificationReason,
        offerDiscussed: analysis.offerDiscussed,
        priceDiscussed: analysis.priceDiscussed,
        objections: JSON.stringify(analysis.objections),
        importantMessages: JSON.stringify(analysis.importantMessages),
        followUpNeeded: analysis.followUpNeeded,
        followUpReason: analysis.followUpReason,
        portfolioMatch: analysis.portfolioCategory,
        suggestedNextAction: analysis.suggestedNextAction,
        confidence: analysis.intentConfidence,
        evidence: JSON.stringify(analysis.evidenceList),
      },
    });

    // Save Analysis log record
    const analysisRecord = await prisma.analysis.create({
      data: {
        leadId: lead.id,
        conversationId: lead.conversations[0]?.id || null,
        intent: analysis.intent,
        intentReason: analysis.intentReason,
        intentConfidence: analysis.intentConfidence,
        qualification: analysis.qualification,
        qualificationReason: analysis.qualificationReason,
        objections: JSON.stringify(analysis.objections),
        portfolioMatched: analysis.portfolioCategory,
        suggestedAction: analysis.suggestedNextAction,
        evidenceList: JSON.stringify(analysis.evidenceList),
        rawAiResponse: JSON.stringify(analysis),
      },
    });

    // Save individual evidence items
    for (const ev of analysis.evidenceList) {
      await prisma.evidence.create({
        data: {
          leadId: lead.id,
          claim: ev.claim,
          evidence: ev.evidence,
          source: ev.source || lead.source,
          confidence: ev.confidence || 'medium',
        },
      });
    }

    return {
      lead: updatedLead,
      analysis: analysisRecord,
      matchedPortfolio,
      isAiGenerated,
      warning,
    };
  }

  static async generateOutreachDraft(leadId: string) {
    const lead = await LeadRepository.findById(leadId);
    if (!lead) {
      throw new Error(`Lead with ID ${leadId} not found.`);
    }

    const matchedPortfolio = await PortfolioService.matchByNiche(lead.portfolioMatch);
    const learnings = await LearningEngine.getContextForAnalysis(lead.niche);
    let parsedEvidence: any[] = [];
    try {
      if (lead.evidence) parsedEvidence = JSON.parse(lead.evidence);
    } catch {
      parsedEvidence = [];
    }

    const { draft, isAiGenerated } = await ConversationAnalyzer.generateOutreachDraft({
      leadInfo: lead,
      evidence: parsedEvidence,
      matchedPortfolio,
      learnings,
    });

    // Save to database
    const savedDraft = await prisma.outreachDraft.create({
      data: {
        leadId: lead.id,
        channel: draft.channel,
        messageBody: draft.messageBody,
        personalizationReason: draft.personalizationReason,
        evidenceUsed: JSON.stringify(draft.evidenceUsed),
        confidence: draft.confidence,
        status: 'DRAFTED',
      },
    });

    return {
      draft: savedDraft,
      isAiGenerated,
    };
  }

  static async approveDraft(draftId: string) {
    const draft = await prisma.outreachDraft.findUnique({
      where: { id: draftId },
      include: { lead: true },
    });

    if (!draft) {
      throw new Error(`Draft ${draftId} not found.`);
    }

    const updatedDraft = await prisma.outreachDraft.update({
      where: { id: draftId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
      },
    });

    // Update lead status to DRAFTED/APPROVED
    await prisma.lead.update({
      where: { id: draft.leadId },
      data: {
        status: 'DRAFTED',
      },
    });

    return updatedDraft;
  }
}
