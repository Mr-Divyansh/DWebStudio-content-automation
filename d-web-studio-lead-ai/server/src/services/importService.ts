import { ImportRepository } from '../database/repositories/importRepository.js';
import { ConversationRepository } from '../database/repositories/conversationRepository.js';
import { LeadRepository } from '../database/repositories/leadRepository.js';
import { InstagramZipExtractor } from '../importers/instagram/instagramZipExtractor.js';
import { InstagramParser } from '../importers/instagram/instagramParser.js';
import { InstagramNormalizer } from '../importers/instagram/instagramNormalizer.js';
import { WhatsAppImporter } from '../importers/whatsapp/whatsappImporter.js';
import { CallImporter } from '../importers/calls/callImporter.js';
import { LeadService } from './leadService.js';
import { prisma } from '../database/client.js';
import path from 'path';
import fs from 'fs';

export class ImportService {
  static async importInstagramZip(filePath?: string) {
    const targetZip = filePath || InstagramZipExtractor.findZipInExportFolder();

    if (!targetZip) {
      throw new Error('No Instagram ZIP file found. Please drop your ZIP file in data/instagram/export/ or upload one.');
    }

    const fileName = path.basename(targetZip);
    const importRecord = await ImportRepository.create({
      source: 'INSTAGRAM',
      fileName,
      filePath: targetZip,
      status: 'PROCESSING',
    });

    const errors: string[] = [];

    try {
      // 1. Safe extraction
      const extractResult = InstagramZipExtractor.extractZip(targetZip);
      if (!extractResult.success) {
        throw new Error(extractResult.errors.join('; '));
      }

      await ImportRepository.updateStats(importRecord.id, {
        filesDiscovered: extractResult.filesDiscovered,
        supportedFiles: extractResult.supportedFiles.length,
        unsupportedFiles: extractResult.unsupportedFiles.length,
      });

      // 2. Group files by conversation directory
      const convoFilesByFolder: Record<string, string[]> = {};
      for (const file of extractResult.supportedFiles) {
        if (file.endsWith('.json') && file.includes('message_')) {
          const folder = path.dirname(file);
          if (!convoFilesByFolder[folder]) convoFilesByFolder[folder] = [];
          convoFilesByFolder[folder].push(file);
        } else if (file.endsWith('direct_messages.json')) {
          convoFilesByFolder['direct_messages'] = [file];
        }
      }

      let totalConvos = 0;
      let totalMessages = 0;
      let totalLeadsCreated = 0;

      // 3. Parse and normalize each thread
      for (const [folder, files] of Object.entries(convoFilesByFolder)) {
        const rawConvos = [];
        for (const f of files) {
          const parsed = InstagramParser.parseFile(f);
          if (parsed) rawConvos.push(parsed);
        }

        if (rawConvos.length === 0) continue;

        const normalized = InstagramNormalizer.normalizeThread(rawConvos, folder);
        if (normalized.messages.length === 0) continue;

        totalConvos++;
        totalMessages += normalized.messages.length;

        // Deduplication check: does conversation already exist?
        let dbConvo = await ConversationRepository.findByExternalId(normalized.externalId);
        let leadId = dbConvo?.leadId;

        if (!dbConvo) {
          // Check if lead already exists by Instagram username
          let existingLead = await LeadRepository.findByInstagramUsername(normalized.clientUsernameOrName);

          if (!existingLead) {
            // Create initial lead
            existingLead = await LeadRepository.create({
              businessName: normalized.title || 'UNKNOWN',
              personName: normalized.clientUsernameOrName || 'UNKNOWN',
              instagramUsername: normalized.clientUsernameOrName,
              source: 'INSTAGRAM',
              sourceConversationId: normalized.externalId,
              conversationSummary: `Imported from Instagram conversation (${normalized.messages.length} messages).`,
              status: 'NEW',
              intent: 'UNKNOWN',
              qualification: 'PENDING_INFO',
            });
            totalLeadsCreated++;
          }

          leadId = existingLead.id;

          // Save conversation & messages
          dbConvo = await ConversationRepository.createWithMessages({
            externalId: normalized.externalId,
            source: 'INSTAGRAM',
            title: normalized.title,
            participantNames: normalized.participantNames,
            rawMetadata: normalized.metadata,
            leadId,
            importId: importRecord.id,
            messages: normalized.messages,
          });
        }

        // Run AI intelligence analysis on this lead
        if (leadId) {
          try {
            await LeadService.runAnalysisOnLead(leadId);
          } catch (analysisErr: any) {
            console.warn(`Analysis warning for lead ${leadId}:`, analysisErr);
            errors.push(`Analysis notice: ${analysisErr?.message || 'Warning during lead analysis'}`);
          }
        }
      }

      // Update final import stats
      await ImportRepository.updateStats(importRecord.id, {
        status: 'COMPLETED',
        conversationCount: totalConvos,
        messageCount: totalMessages,
        leadCount: totalLeadsCreated,
        errors,
      });

      return {
        importId: importRecord.id,
        filesDiscovered: extractResult.filesDiscovered,
        supportedFiles: extractResult.supportedFiles.length,
        conversationCount: totalConvos,
        messageCount: totalMessages,
        leadsCreated: totalLeadsCreated,
        errors,
      };
    } catch (err: any) {
      console.error('Instagram import failed:', err);
      errors.push(err?.message || 'Import error');
      await ImportRepository.updateStats(importRecord.id, {
        status: 'FAILED',
        errors,
      });
      throw err;
    }
  }

  static async importWhatsApp(chatText: string, title?: string) {
    const parsed = WhatsAppImporter.parseChatText(chatText, title);
    if (!parsed.success) {
      throw new Error(parsed.errors.join('; '));
    }

    const importRecord = await ImportRepository.create({
      source: 'WHATSAPP',
      fileName: title || 'WhatsApp Chat Export',
      status: 'PROCESSING',
    });

    // Create lead
    const clientName = parsed.participants.find(
      (p) => !p.toLowerCase().includes('d web') && !p.toLowerCase().includes('agency')
    ) || 'UNKNOWN';

    const lead = await LeadRepository.create({
      businessName: clientName !== 'UNKNOWN' ? clientName : 'WhatsApp Contact',
      personName: clientName,
      source: 'WHATSAPP',
      sourceConversationId: parsed.externalId,
      conversationSummary: `Imported from WhatsApp chat (${parsed.messages.length} messages).`,
      status: 'NEW',
      intent: 'UNKNOWN',
      qualification: 'PENDING_INFO',
    });

    // Save conversation & messages
    await ConversationRepository.createWithMessages({
      externalId: parsed.externalId,
      source: 'WHATSAPP',
      title: parsed.title,
      participantNames: parsed.participants,
      leadId: lead.id,
      importId: importRecord.id,
      messages: parsed.messages,
    });

    // Run AI analysis
    await LeadService.runAnalysisOnLead(lead.id);

    await ImportRepository.updateStats(importRecord.id, {
      status: 'COMPLETED',
      conversationCount: 1,
      messageCount: parsed.messages.length,
      leadCount: 1,
    });

    return {
      importId: importRecord.id,
      leadId: lead.id,
      messageCount: parsed.messages.length,
    };
  }

  static async importCall(rawTranscript: string, metadata?: { title?: string; callNotes?: string; durationMinutes?: number }) {
    const parsed = CallImporter.parseTranscript(rawTranscript, metadata);
    if (!parsed.success) {
      throw new Error(parsed.errors.join('; '));
    }

    const importRecord = await ImportRepository.create({
      source: 'CALLS',
      fileName: metadata?.title || 'Call Transcript',
      status: 'PROCESSING',
    });

    const clientSpeaker = parsed.participants.find(
      (p) => !p.toLowerCase().includes('d web') && !p.toLowerCase().includes('agent') && !p.toLowerCase().includes('host')
    ) || 'UNKNOWN';

    const lead = await LeadRepository.create({
      businessName: clientSpeaker !== 'UNKNOWN' ? `${clientSpeaker}'s Business` : 'Discovery Call Lead',
      personName: clientSpeaker,
      source: 'CALLS',
      sourceConversationId: parsed.externalId,
      conversationSummary: `Imported from discovery call (${parsed.messages.length} turns, ${metadata?.durationMinutes || 30} mins).`,
      notes: metadata?.callNotes,
      status: 'NEW',
      intent: 'UNKNOWN',
      qualification: 'PENDING_INFO',
    });

    await ConversationRepository.createWithMessages({
      externalId: parsed.externalId,
      source: 'CALLS',
      title: parsed.title,
      participantNames: parsed.participants,
      rawMetadata: {
        durationMinutes: metadata?.durationMinutes,
        callNotes: metadata?.callNotes,
      },
      leadId: lead.id,
      importId: importRecord.id,
      messages: parsed.messages.map((m) => ({
        sender: m.speaker,
        senderType: m.speakerType,
        content: m.content,
        timestamp: m.timestamp,
      })),
    });

    // Run AI analysis
    await LeadService.runAnalysisOnLead(lead.id);

    await ImportRepository.updateStats(importRecord.id, {
      status: 'COMPLETED',
      conversationCount: 1,
      messageCount: parsed.messages.length,
      leadCount: 1,
    });

    return {
      importId: importRecord.id,
      leadId: lead.id,
      messageCount: parsed.messages.length,
    };
  }

  static async getAllImports() {
    return ImportRepository.findAll();
  }
}
