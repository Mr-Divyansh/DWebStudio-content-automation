export interface WhatsAppRawMessage {
  timestamp: Date;
  sender: string;
  content: string;
}

export interface WhatsAppImportResult {
  success: boolean;
  externalId: string;
  title: string;
  participants: string[];
  messages: Array<{
    sender: string;
    senderType: 'USER' | 'CLIENT' | 'UNKNOWN';
    content: string;
    timestamp: Date;
  }>;
  transcriptText: string;
  errors: string[];
}

export class WhatsAppImporter {
  /**
   * Parses WhatsApp exported chat log text.
   * Handles formats:
   * 1) [24/02/2025, 14:32:10] John: Hello
   * 2) 2/24/25, 2:32 PM - John: Hello
   * 3) 24/02/2025, 14:32 - John: Hello
   */
  static parseChatText(rawText: string, defaultTitle = 'WhatsApp Conversation'): WhatsAppImportResult {
    const result: WhatsAppImportResult = {
      success: false,
      externalId: `wa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: defaultTitle,
      participants: [],
      messages: [],
      transcriptText: '',
      errors: [],
    };

    if (!rawText || !rawText.trim()) {
      result.errors.push('Empty WhatsApp transcript provided.');
      return result;
    }

    const lines = rawText.split(/\r?\n/);
    const parsedMessages: WhatsAppRawMessage[] = [];
    let currentMessage: WhatsAppRawMessage | null = null;

    // Regex 1: [DD/MM/YYYY, HH:MM:SS] Sender: message
    const bracketRegex = /^\[(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)\]\s*([^:]+):\s*(.*)$/;
    // Regex 2: MM/DD/YY, H:MM PM - Sender: message
    const dashRegex = /^(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)\s*-\s*([^:]+):\s*(.*)$/;

    for (const line of lines) {
      const matchBracket = line.match(bracketRegex);
      const matchDash = line.match(dashRegex);
      const match = matchBracket || matchDash;

      if (match) {
        if (currentMessage) {
          parsedMessages.push(currentMessage);
        }

        const dateStr = match[1];
        const timeStr = match[2];
        const sender = match[3].trim();
        const content = match[4].trim();

        let timestamp = new Date(`${dateStr} ${timeStr}`);
        if (isNaN(timestamp.getTime())) {
          timestamp = new Date();
        }

        currentMessage = {
          timestamp,
          sender,
          content,
        };
      } else if (currentMessage) {
        // Continuation line of multi-line message
        currentMessage.content += `\n${line}`;
      }
    }

    if (currentMessage) {
      parsedMessages.push(currentMessage);
    }

    if (parsedMessages.length === 0) {
      result.errors.push('No recognized WhatsApp message headers found. Expected format: [DD/MM/YYYY, HH:MM:SS] Sender: Message or MM/DD/YY, H:MM PM - Sender: Message.');
      return result;
    }

    const participants = Array.from(new Set(parsedMessages.map((m) => m.sender)));
    result.participants = participants;

    result.messages = parsedMessages.map((m) => {
      const isLikelyUser =
        m.sender.toLowerCase().includes('d web studio') ||
        m.sender.toLowerCase().includes('dweb') ||
        m.sender.toLowerCase().includes('agency');

      return {
        sender: m.sender,
        senderType: isLikelyUser ? 'USER' : 'CLIENT',
        content: m.content,
        timestamp: m.timestamp,
      };
    });

    result.transcriptText = result.messages
      .map((m) => `[${m.timestamp.toISOString()}] ${m.sender} (${m.senderType}): ${m.content}`)
      .join('\n');

    result.success = true;
    return result;
  }
}

/**
 * Interface contract for future WhatsApp Business Cloud API integrations
 */
export interface WhatsAppCloudApiWebhookPayload {
  object: 'whatsapp_business_account';
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: 'whatsapp';
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          text?: { body: string };
          type: string;
        }>;
      };
      field: string;
    }>;
  }>;
}
