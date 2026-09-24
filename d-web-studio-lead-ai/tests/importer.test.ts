import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { InstagramZipExtractor } from '../server/src/importers/instagram/instagramZipExtractor.js';
import { InstagramParser } from '../server/src/importers/instagram/instagramParser.js';
import { InstagramNormalizer } from '../server/src/importers/instagram/instagramNormalizer.js';
import { WhatsAppImporter } from '../server/src/importers/whatsapp/whatsappImporter.js';
import { CallImporter } from '../server/src/importers/calls/callImporter.js';

export async function runImporterTests(): Promise<{ name: string; passed: boolean; message?: string }[]> {
  const results: { name: string; passed: boolean; message?: string }[] = [];

  // Test 1: Instagram Latin-1 / UTF-8 character fix
  try {
    const rawWithLatin1 = 'Caf\u00c3\u00a9 & Brasserie'; // "Café & Brasserie" encoded in Latin1 bytes
    const fixed = InstagramParser.fixEncoding(rawWithLatin1);
    const passed = fixed.includes('Café') || fixed.includes('Cafe');
    results.push({
      name: 'Instagram Parser: Fixes Latin-1 encoded UTF-8 characters',
      passed,
      message: `Decoded: "${fixed}"`,
    });
  } catch (err: any) {
    results.push({ name: 'Instagram Parser: Latin-1 encoding test', passed: false, message: err?.message });
  }

  // Test 2: Instagram ZIP creation and safe extraction
  try {
    const tmpDir = path.resolve(process.cwd(), 'tests', 'tmp_test_export');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    // Create a mock Instagram message JSON
    const mockConvoJson = {
      title: 'Mock Fitness Gym',
      participants: [{ name: 'Mock Fitness Gym' }, { name: 'D Web Studio' }],
      messages: [
        {
          sender_name: 'Mock Fitness Gym',
          timestamp_ms: Date.now() - 10000,
          content: 'Hey, do you build websites with Mindbody class schedule integration?',
        },
        {
          sender_name: 'D Web Studio',
          timestamp_ms: Date.now() - 5000,
          content: 'Yes we do! We just completed Apex Strength Club with full Mindbody sync.',
        },
      ],
    };

    const mockFolder = path.join(tmpDir, 'mock_convo_1');
    if (!fs.existsSync(mockFolder)) fs.mkdirSync(mockFolder, { recursive: true });
    fs.writeFileSync(path.join(mockFolder, 'message_1.json'), JSON.stringify(mockConvoJson));

    // Pack into a test ZIP
    const zipPath = path.join(tmpDir, 'test-instagram-export.zip');
    const zip = new AdmZip();
    zip.addLocalFolder(tmpDir, 'messages/inbox');
    zip.writeZip(zipPath);

    // Now test extraction
    const extractOut = path.join(tmpDir, 'extracted_output');
    const extractResult = InstagramZipExtractor.extractZip(zipPath, extractOut);

    results.push({
      name: 'ZIP Extractor: Discovers and safely extracts message files',
      passed: extractResult.success && extractResult.supportedFiles.length > 0,
      message: `Found ${extractResult.supportedFiles.length} supported files`,
    });

    // Test 3: Normalization of parsed message thread
    const parsed = InstagramParser.parseFile(extractResult.supportedFiles[0]);
    if (parsed) {
      const normalized = InstagramNormalizer.normalizeThread([parsed]);
      results.push({
        name: 'Instagram Normalizer: Normalizes participants, chronological sorting, and sender types',
        passed: normalized.messages.length === 2 && normalized.clientUsernameOrName === 'Mock Fitness Gym',
        message: `Client: ${normalized.clientUsernameOrName}, Msg Count: ${normalized.messages.length}`,
      });
    } else {
      results.push({
        name: 'Instagram Normalizer: Parse file',
        passed: false,
        message: 'Could not parse mock file',
      });
    }

    // Cleanup tmp files
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (err: any) {
    results.push({ name: 'ZIP Extractor test exception', passed: false, message: err?.message });
  }

  // Test 4: WhatsApp chat parsing
  try {
    const sampleWaText = `
[12/03/2025, 10:15:00] Bella Bistro: Hi D Web Studio, we want a website redesign for our restaurant.
[12/03/2025, 10:16:30] D Web Studio: Hi there! We specialize in modern restaurant sites with online reservations.
[12/03/2025, 10:18:00] Bella Bistro: How much would it cost to include an online menu with allergen filters?
`;
    const waResult = WhatsAppImporter.parseChatText(sampleWaText, 'Bella Bistro WhatsApp');
    results.push({
      name: 'WhatsApp Importer: Parses timestamps, senders, and generates unified message models',
      passed: waResult.success && waResult.messages.length === 3 && waResult.participants.includes('Bella Bistro'),
      message: `Messages parsed: ${waResult.messages.length}`,
    });
  } catch (err: any) {
    results.push({ name: 'WhatsApp Importer test', passed: false, message: err?.message });
  }

  // Test 5: Call transcript parsing
  try {
    const sampleCallText = `
Speaker 1: Hi Alex, thanks for joining the discovery call today.
Client: Hey team, we run an aesthetic clinic in Miami and our current site is super slow.
Speaker 1: Understood. What is your timeline for the new site?
Client: We want to launch before summer, around May.
`;
    const callResult = CallImporter.parseTranscript(sampleCallText, {
      title: 'Miami Aesthetic Clinic Call',
      durationMinutes: 20,
    });
    results.push({
      name: 'Call Importer: Segments speakers and normalizes transcript turns',
      passed: callResult.success && callResult.messages.length === 4,
      message: `Turns parsed: ${callResult.messages.length}`,
    });
  } catch (err: any) {
    results.push({ name: 'Call Importer test', passed: false, message: err?.message });
  }

  return results;
}
