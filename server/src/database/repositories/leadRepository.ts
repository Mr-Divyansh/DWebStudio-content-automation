import { prisma } from '../client.js';

export interface LeadFilterOptions {
  status?: string;
  intent?: string;
  niche?: string;
  source?: string;
  search?: string;
  followUpOnly?: boolean;
  limit?: number;
  offset?: number;
}

export class LeadRepository {
  static async findAll(filters: LeadFilterOptions = {}) {
    const where: any = {};

    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }
    if (filters.intent && filters.intent !== 'ALL') {
      where.intent = filters.intent;
    }
    if (filters.niche && filters.niche !== 'ALL') {
      where.niche = filters.niche;
    }
    if (filters.source && filters.source !== 'ALL') {
      where.source = filters.source;
    }
    if (filters.followUpOnly) {
      where.followUpNeeded = true;
    }
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { businessName: { contains: q } },
        { personName: { contains: q } },
        { instagramUsername: { contains: q } },
        { email: { contains: q } },
        { location: { contains: q } },
        { niche: { contains: q } },
        { conversationSummary: { contains: q } },
      ];
    }

    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
        include: {
          analyses: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
          outreachDrafts: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
    ]);

    return { total, leads };
  }

  static async findById(id: string) {
    return prisma.lead.findUnique({
      where: { id },
      include: {
        conversations: {
          include: {
            messages: {
              orderBy: { timestamp: 'asc' },
            },
          },
        },
        analyses: {
          orderBy: { createdAt: 'desc' },
        },
        corrections: {
          orderBy: { createdAt: 'desc' },
        },
        outreachDrafts: {
          orderBy: { createdAt: 'desc' },
        },
        evidenceItems: {
          orderBy: { createdAt: 'desc' },
        },
        researchRecords: {
          orderBy: { createdAt: 'desc' },
        },
        qualifications: {
          orderBy: { createdAt: 'desc' },
        },
        learnings: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  static async findByInstagramUsername(username: string) {
    if (!username || username === 'UNKNOWN') return null;
    return prisma.lead.findFirst({
      where: {
        instagramUsername: username,
      },
    });
  }

  static async findBySourceConversationId(source: string, sourceConversationId: string) {
    return prisma.lead.findFirst({
      where: {
        source,
        sourceConversationId,
      },
    });
  }

  static async create(data: any) {
    return prisma.lead.create({
      data,
    });
  }

  static async update(id: string, data: any) {
    return prisma.lead.update({
      where: { id },
      data,
    });
  }

  static async delete(id: string) {
    return prisma.lead.delete({
      where: { id },
    });
  }

  static async getStats() {
    const [
      total,
      newLeads,
      qualified,
      interested,
      rejected,
      followUps,
      closed,
    ] = await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { status: 'NEW' } }),
      prisma.lead.count({ where: { status: 'QUALIFIED' } }),
      prisma.lead.count({ where: { OR: [{ status: 'INTERESTED' }, { intent: 'INTERESTED' }] } }),
      prisma.lead.count({ where: { OR: [{ status: 'REJECTED' }, { intent: 'NOT_INTERESTED' }] } }),
      prisma.lead.count({ where: { followUpNeeded: true } }),
      prisma.lead.count({ where: { status: 'CLOSED' } }),
    ]);

    const niches = await prisma.lead.groupBy({
      by: ['niche'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 8,
    });

    const intents = await prisma.lead.groupBy({
      by: ['intent'],
      _count: { id: true },
    });

    const sources = await prisma.lead.groupBy({
      by: ['source'],
      _count: { id: true },
    });

    return {
      total,
      newLeads,
      qualified,
      interested,
      rejected,
      followUps,
      closed,
      niches: niches.map((n) => ({ niche: n.niche, count: n._count.id })),
      intents: intents.map((i) => ({ intent: i.intent, count: i._count.id })),
      sources: sources.map((s) => ({ source: s.source, count: s._count.id })),
    };
  }
}
