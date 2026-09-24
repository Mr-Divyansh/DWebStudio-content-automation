import { prisma } from '../client.js';

export class PortfolioRepository {
  static async findAll() {
    return prisma.portfolioProject.findMany({
      orderBy: { category: 'asc' },
    });
  }

  static async findByCategory(category: string) {
    return prisma.portfolioProject.findFirst({
      where: {
        category: {
          equals: category,
        },
      },
    });
  }

  static async create(data: {
    title: string;
    category: string;
    description: string;
    technologies?: string;
    results?: string;
    liveUrl?: string;
    keyFeatures?: string;
  }) {
    return prisma.portfolioProject.create({
      data,
    });
  }
}
