export interface CallMessage {
  speaker: string;
  speakerType: 'USER' | 'CLIENT' | 'UNKNOWN';
  content: string;
  timestamp: Date;
}

export interface CallImportResult {
  success: boolean;
  externalId: string;
  title: string;
  participants: string[];
  messages: CallMessage[];
  transcriptText: string;
  callNotes?: string;
  durationMinutes?: number;
  errors: string[];
}

export class CallImporter {
  static parseTranscript(
    rawText: string,
    metadata?: { title?: string; callNotes?: string; durationMinutes?: number }
  ): CallImportResult {
    const result: CallImportResult = {
      success: false,
      externalId: `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: metadata?.title || 'Discovery Call Transcript',
      participants: [],
      messages: [],
      transcriptText: '',
      callNotes: metadata?.callNotes,
      durationMinutes: metadata?.durationMinutes,
      errors: [],
    };

    if (!rawText || !rawText.trim()) {
      result.errors.push('Empty call transcript text provided.');
      return result;
    }

    const lines = rawText.split(/\r?\n/);
    const messages: CallMessage[] = [];
    let currentMessage: CallMessage | null = null;
    let baseTime = Date.now() - (metadata?.durationMinutes || 30) * 60 * 1000;

    // Pattern: "Speaker Name: text" or "Agent (12:04): text" or "[00:02:15] Speaker: text"
    const speakerPattern = /^(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*)?([^:\n]{2,35}):\s*(.*)$/;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Skip VTT/SRT headers or cue index numbers
      if (/^(WEBVTT|NOTE|\d+)$/i.test(trimmed) || /^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->/i.test(trimmed)) {
        continue;
      }

      const match = trimmed.match(speakerPattern);
      if (match) {
        if (currentMessage) {
          messages.push(currentMessage);
        }

        const speaker = match[2].trim();
        const content = match[3].trim();
        baseTime += 15000; // Increment 15s per turn

        const isUser =
          speaker.toLowerCase().includes('d web studio') ||
          speaker.toLowerCase().includes('agent') ||
          speaker.toLowerCase().includes('host') ||
          speaker.toLowerCase().includes('rep') ||
          speaker.toLowerCase().includes('interviewer');

        currentMessage = {
          speaker,
          speakerType: isUser ? 'USER' : 'CLIENT',
          content,
          timestamp: new Date(baseTime),
        };
      } else if (currentMessage) {
        currentMessage.content += ` ${trimmed}`;
      }
    }

    if (currentMessage) {
      messages.push(currentMessage);
    }

    if (messages.length === 0) {
      // Fallback: entire text treated as structured notes or single turn
      messages.push({
        speaker: 'Call Notes',
        speakerType: 'CLIENT',
        content: rawText.trim(),
        timestamp: new Date(),
      });
    }

    result.participants = Array.from(new Set(messages.map((m) => m.speaker)));
    result.messages = messages;
    result.transcriptText = messages
      .map((m) => `[${m.speaker} (${m.speakerType})]: ${m.content}`)
      .join('\n');

    if (metadata?.callNotes) {
      result.transcriptText += `\n\n[HUMAN OPERATOR NOTES]:\n${metadata.callNotes}`;
    }

    result.success = true;
    return result;
  }
}
