import { prisma } from '../client.js';

export class CorrectionRepository {
  static async create(data: {
    leadId: string;
    field: string;
    originalValue: string;
    correctedValue: string;
    userReason?: string;
  }) {
    return prisma.correction.create({
      data,
      include: {
        lead: true,
      },
    });
  }

  static async findByLead(leadId: string) {
    return prisma.correction.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async findAll(limit = 50) {
    return prisma.correction.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            niche: true,
          },
        },
      },
    });
  }
}
