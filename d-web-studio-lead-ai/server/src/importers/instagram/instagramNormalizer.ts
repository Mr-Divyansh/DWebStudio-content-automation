import { RawInstagramConversation } from './instagramParser.js';
import path from 'path';

export interface NormalizedMessage {
  sender: string;
  senderType: 'USER' | 'CLIENT' | 'UNKNOWN';
  content: string;
  timestamp: Date;
  sourceMessageId?: string;
  metadata?: any;
}

export interface NormalizedConversation {
  externalId: string;
  source: 'INSTAGRAM';
  title: string;
  participantNames: string[];
  messages: NormalizedMessage[];
  fullTranscriptText: string;
  clientUsernameOrName: string;
  metadata: any;
}

export class InstagramNormalizer {
  static normalizeThread(
    rawConversations: RawInstagramConversation[],
    folderPathHint?: string
  ): NormalizedConversation {
    // Combine messages across split files (e.g. message_1.json, message_2.json)
    const primary = rawConversations[0] || {
      title: 'Untitled',
      participants: [],
      messages: [],
    };

    const participantNames = Array.from(
      new Set(
        rawConversations.flatMap((c) => (c.participants || []).map((p) => p.name))
      )
    );

    const allMessages: NormalizedMessage[] = [];

    // Figure out our own business username / agency name
    // Usually the user running D Web Studio or the one who is the sender in common
    const primaryTitle = primary.title;

    for (const conv of rawConversations) {
      for (const msg of conv.messages) {
        if (!msg.content && !msg.share?.link && !msg.photos) {
          continue; // skip completely empty reactions/system artifacts
        }

        let body = msg.content || '';
        if (msg.share?.link) {
          body += ` [Shared link: ${msg.share.link}]`;
        }
        if (msg.photos && msg.photos.length > 0) {
          body += ` [Sent ${msg.photos.length} photo(s)]`;
        }

        const isLikelyUser =
          msg.sender_name.toLowerCase().includes('d web studio') ||
          msg.sender_name.toLowerCase().includes('dwebstudio') ||
          (primaryTitle && msg.sender_name !== primaryTitle && participantNames.length === 2 && msg.sender_name.toLowerCase().includes('dweb'));

        const senderType: 'USER' | 'CLIENT' | 'UNKNOWN' = isLikelyUser
          ? 'USER'
          : msg.sender_name === primaryTitle || participantNames.includes(msg.sender_name)
          ? 'CLIENT'
          : 'UNKNOWN';

        allMessages.push({
          sender: msg.sender_name,
          senderType,
          content: body.trim(),
          timestamp: new Date(msg.timestamp_ms || Date.now()),
        });
      }
    }

    // Sort chronologically ascending
    allMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Generate externalId
    let externalId = primary.thread_path || '';
    if (!externalId && folderPathHint) {
      externalId = path.basename(folderPathHint);
    }
    if (!externalId) {
      externalId = `ig_${primaryTitle.replace(/[^a-zA-Z0-9]/g, '_')}`;
    }

    // Determine client's name or handle
    const otherParticipants = participantNames.filter(
      (p) => !p.toLowerCase().includes('d web studio') && !p.toLowerCase().includes('dwebstudio')
    );
    const clientUsernameOrName = otherParticipants[0] || primaryTitle || 'UNKNOWN';

    // Build transcript text for AI analysis
    const fullTranscriptText = allMessages
      .map((m) => `[${m.timestamp.toISOString()}] ${m.sender} (${m.senderType}): ${m.content}`)
      .join('\n');

    return {
      externalId,
      source: 'INSTAGRAM',
      title: primaryTitle,
      participantNames,
      messages: allMessages,
      fullTranscriptText,
      clientUsernameOrName,
      metadata: {
        threadType: primary.thread_type,
        folderPathHint,
        totalMessages: allMessages.length,
      },
    };
  }
}
