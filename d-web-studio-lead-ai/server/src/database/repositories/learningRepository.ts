import { prisma } from '../client.js';

export class LearningRepository {
  static async findAll(filters: { type?: string; appliesTo?: string } = {}) {
    const where: any = {};
    if (filters.type && filters.type !== 'ALL') {
      where.type = filters.type;
    }
    if (filters.appliesTo && filters.appliesTo !== 'ALL') {
      where.appliesTo = filters.appliesTo;
    }

    return prisma.learning.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        relatedLead: {
          select: {
            id: true,
            businessName: true,
            niche: true,
          },
        },
      },
    });
  }

  static async findRelevant(niche?: string, limit = 6) {
    // Return learnings that apply to this specific niche or to "General" / "All"
    const whereClause: any = {
      OR: [
        { appliesTo: 'All' },
        { appliesTo: 'General' },
      ],
    };

    if (niche && niche !== 'UNKNOWN') {
      whereClause.OR.push({ appliesTo: { contains: niche } });
    }

    return prisma.learning.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  static async create(data: {
    learning: string;
    type: string;
    evidence?: string[];
    confidence?: string;
    appliesTo?: string;
    source?: string;
    relatedLeadId?: string;
  }) {
    return prisma.learning.create({
      data: {
        learning: data.learning,
        type: data.type,
        evidence: data.evidence ? JSON.stringify(data.evidence) : null,
        confidence: data.confidence || 'MEDIUM',
        appliesTo: data.appliesTo || 'General',
        source: data.source || 'CONVERSATION_ANALYSIS',
        relatedLeadId: data.relatedLeadId,
      },
    });
  }

  static async delete(id: string) {
    return prisma.learning.delete({
      where: { id },
    });
  }
}
