import fs from 'fs';

export interface RawInstagramMessage {
  sender_name: string;
  timestamp_ms: number;
  content?: string;
  photos?: Array<{ uri: string }>;
  audio_files?: Array<{ uri: string }>;
  share?: { link?: string; share_text?: string };
  reactions?: Array<{ reaction: string; actor: string }>;
  type?: string;
}

export interface RawInstagramConversation {
  participants: Array<{ name: string }>;
  messages: RawInstagramMessage[];
  title: string;
  is_still_participant?: boolean;
  thread_type?: string;
  thread_path?: string;
}

export class InstagramParser {
  /**
   * Fixes Instagram's infamous Latin-1 escaped UTF-8 strings.
   * Instagram often dumps UTF-8 bytes into a Latin-1 escaped string (e.g. \u00e9)
   */
  static fixEncoding(text?: string): string {
    if (!text) return '';
    try {
      return Buffer.from(text, 'latin1').toString('utf8');
    } catch {
      return text;
    }
  }

  static parseFile(filePath: string): RawInstagramConversation | null {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);

      if (data && Array.isArray(data.messages)) {
        const title = this.fixEncoding(data.title || 'Untitled Conversation');
        const participants = (data.participants || []).map((p: any) => ({
          name: this.fixEncoding(p.name),
        }));

        const messages: RawInstagramMessage[] = data.messages.map((m: any) => ({
          sender_name: this.fixEncoding(m.sender_name),
          timestamp_ms: m.timestamp_ms || Date.now(),
          content: this.fixEncoding(m.content),
          photos: m.photos,
          audio_files: m.audio_files,
          share: m.share
            ? {
                link: m.share.link,
                share_text: this.fixEncoding(m.share.share_text),
              }
            : undefined,
          reactions: m.reactions,
          type: m.type,
        }));

        return {
          title,
          participants,
          messages,
          thread_type: data.thread_type,
          thread_path: data.thread_path,
        };
      }
    } catch (err) {
      console.warn(`Could not parse Instagram message file at ${filePath}:`, err);
    }
    return null;
  }
}
