import { prisma } from '../client.js';

export class ImportRepository {
  static async create(data: {
    source: string;
    fileName: string;
    filePath?: string;
    status?: string;
  }) {
    return prisma.import.create({
      data: {
        source: data.source,
        fileName: data.fileName,
        filePath: data.filePath,
        status: data.status || 'PENDING',
      },
    });
  }

  static async updateStats(id: string, data: {
    status?: string;
    filesDiscovered?: number;
    supportedFiles?: number;
    unsupportedFiles?: number;
    conversationCount?: number;
    messageCount?: number;
    leadCount?: number;
    errors?: string[];
  }) {
    return prisma.import.update({
      where: { id },
      data: {
        ...(data.status ? { status: data.status } : {}),
        ...(data.filesDiscovered !== undefined ? { filesDiscovered: data.filesDiscovered } : {}),
        ...(data.supportedFiles !== undefined ? { supportedFiles: data.supportedFiles } : {}),
        ...(data.unsupportedFiles !== undefined ? { unsupportedFiles: data.unsupportedFiles } : {}),
        ...(data.conversationCount !== undefined ? { conversationCount: data.conversationCount } : {}),
        ...(data.messageCount !== undefined ? { messageCount: data.messageCount } : {}),
        ...(data.leadCount !== undefined ? { leadCount: data.leadCount } : {}),
        ...(data.errors !== undefined ? { errors: JSON.stringify(data.errors) } : {}),
      },
    });
  }

  static async findAll() {
    return prisma.import.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { conversations: true },
        },
      },
    });
  }

  static async findById(id: string) {
    return prisma.import.findUnique({
      where: { id },
      include: {
        conversations: {
          include: {
            lead: true,
          },
        },
      },
    });
  }
}
