import { prisma } from '../client.js';

export class ConversationRepository {
  static async findByExternalId(externalId: string) {
    return prisma.conversation.findUnique({
      where: { externalId },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });
  }

  static async createWithMessages(data: {
    externalId: string;
    source: string;
    title: string;
    participantNames?: string[];
    rawMetadata?: any;
    leadId?: string;
    importId?: string;
    messages: Array<{
      sender: string;
      senderType: string;
      content: string;
      timestamp: Date;
      sourceMessageId?: string;
      metadata?: any;
    }>;
  }) {
    return prisma.conversation.create({
      data: {
        externalId: data.externalId,
        source: data.source,
        title: data.title,
        participantNames: data.participantNames ? JSON.stringify(data.participantNames) : null,
        messageCount: data.messages.length,
        rawMetadata: data.rawMetadata ? JSON.stringify(data.rawMetadata) : null,
        leadId: data.leadId,
        importId: data.importId,
        messages: {
          create: data.messages.map((m) => ({
            sender: m.sender,
            senderType: m.senderType,
            content: m.content,
            timestamp: m.timestamp,
            sourceMessageId: m.sourceMessageId,
            metadata: m.metadata ? JSON.stringify(m.metadata) : null,
          })),
        },
      },
      include: {
        messages: true,
      },
    });
  }

  static async linkToLead(conversationId: string, leadId: string) {
    return prisma.conversation.update({
      where: { id: conversationId },
      data: { leadId },
    });
  }

  static async getMessagesByConversation(conversationId: string) {
    return prisma.message.findMany({
      where: { conversationId },
      orderBy: { timestamp: 'asc' },
    });
  }
}
