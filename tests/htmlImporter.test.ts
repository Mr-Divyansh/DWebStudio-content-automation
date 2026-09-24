import fs from 'fs';
import path from 'path';
import { InstagramHtmlParser } from '../server/src/importers/instagram/instagramHtmlParser.js';
import { InstagramNormalizer } from '../server/src/importers/instagram/instagramNormalizer.js';

type Result = { name: string; passed: boolean; message?: string };

/**
 * Mock Instagram HTML export mirroring the real export's structure
 * (message containers, duplicated content copies, _a6-o timestamps,
 * newest-first document order) using only fake example messages.
 */
function mockConversationHtml(): string {
  return `<html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><title>Mock Fitness Gym</title></head>
<body><header><h1>Mock Fitness Gym</h1></header><main>
<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">Person B</h2><div class="_3-95 _a6-p"><div><div></div><div>Sure, I can help.<br /><a target="_blank" href="https://example.com/portfolio">https://example.com/portfolio</a></div><div><div><div>Sure, I can help.
https://example.com/portfolio</div><div><a target="_blank" href="https://example.com/portfolio">https://example.com/portfolio</a></div></div></div><div></div></div></div><div class="_3-94 _a6-o">Mar 10, 2026 11:50 am</div></div>
<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">Person A</h2><div class="_3-95 _a6-p"><div><div></div><div>Hello, I need a website.</div><div><div><div>Hello, I need a website.</div></div></div><div></div></div></div><div class="_3-94 _a6-o">Mar 10, 2026 11:48 am</div></div>
</main></body></html>`;
}

export async function runHtmlImporterTests(): Promise<Result[]> {
  const results: Result[] = [];

  // Test 1: Recursive HTML discovery finds conversation files at any depth
  try {
    const tmpRoot = path.resolve(process.cwd(), 'tests', 'tmp_html_export');
    const convFolder = path.join(tmpRoot, 'activity', 'messages', 'inbox', 'mock_gym_123');
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(convFolder, { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'media'), { recursive: true });
    fs.writeFileSync(path.join(convFolder, 'message_1.html'), mockConversationHtml());
    fs.writeFileSync(path.join(convFolder, 'message_2.html'), mockConversationHtml());
    fs.writeFileSync(path.join(tmpRoot, 'start_here.html'), '<html><body>export landing page</body></html>');
    fs.writeFileSync(path.join(tmpRoot, 'media', 'photo.jpg'), 'not-an-html-file');

    const discovery = InstagramHtmlParser.discover(tmpRoot);
    results.push({
      name: 'HTML Discovery: Recursively finds message_*.html at any nesting depth',
      passed:
        discovery.totalHtmlFiles === 3 &&
        discovery.conversationFiles.length === 2 &&
        discovery.otherHtmlFiles === 1 &&
        discovery.errors.length === 0,
      message: `html=${discovery.totalHtmlFiles}, conversations=${discovery.conversationFiles.length}, other=${discovery.otherHtmlFiles}`,
    });

    // Test 2: File-level parsing from disk
    const parsedFile = InstagramHtmlParser.parseFile(path.join(convFolder, 'message_1.html'));
    results.push({
      name: 'HTML Parser: Parses a conversation file from disk',
      passed: parsedFile !== null && parsedFile.messages.length === 2,
      message: `messages=${parsedFile?.messages.length ?? 'null'}`,
    });

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch (err: any) {
    results.push({ name: 'HTML Discovery test exception', passed: false, message: err?.message });
  }

  // Test 3: Title + sender extraction
  try {
    const parsed = InstagramHtmlParser.parseHtml(mockConversationHtml(), 'mock_gym_123');
    const senders = parsed?.messages.map((m) => m.sender_name) || [];
    results.push({
      name: 'HTML Parser: Extracts conversation title and senders',
      passed:
        parsed?.title === 'Mock Fitness Gym' &&
        senders.includes('Person A') &&
        senders.includes('Person B'),
      message: `title=${parsed?.title}, senders=${[...new Set(senders)].join(', ')}`,
    });

    // Test 4: Message text extraction (with duplicate-copy dedupe)
    const contents = parsed?.messages.map((m) => m.content || '') || [];
    const helloCount = contents.join('\n').split('Hello, I need a website.').length - 1;
    results.push({
      name: 'HTML Parser: Extracts message text without duplicating the nested copy',
      passed:
        contents.some((c) => c.includes('Hello, I need a website.')) &&
        contents.some((c) => c.includes('Sure, I can help.')) &&
        helloCount === 1,
      message: `occurrences of sample message: ${helloCount}`,
    });

    // Test 5: Timestamp extraction (compared against equivalent Date parse)
    const expectedA = new Date('Mar 10, 2026 11:48 AM').getTime();
    const msgA = parsed?.messages.find((m) => (m.content || '').includes('Hello'));
    results.push({
      name: 'HTML Parser: Extracts timestamps from export date text',
      passed: !!msgA && msgA.timestamp_ms === expectedA,
      message: msgA ? `timestamp matched: ${msgA.timestamp_ms === expectedA}` : 'message not found',
    });

    // Test 6: Link extraction survives into message content
    const msgB = parsed?.messages.find((m) => (m.content || '').includes('Sure'));
    results.push({
      name: 'HTML Parser: Preserves links present in message HTML',
      passed: !!msgB && (msgB.content || '').includes('https://example.com/portfolio'),
      message: msgB ? 'link present in content' : 'message not found',
    });
  } catch (err: any) {
    results.push({ name: 'HTML Parser extraction tests exception', passed: false, message: err?.message });
  }

  // Test 7: Message ordering — HTML doc is newest-first; normalized output
  // must be chronological (oldest first), matching the existing pipeline.
  try {
    const parsed = InstagramHtmlParser.parseHtml(mockConversationHtml(), 'mock_gym_123');
    const normalized = InstagramNormalizer.normalizeThread([parsed!], 'mock_gym_123');
    const first = normalized.messages[0]?.content || '';
    const second = normalized.messages[1]?.content || '';
    results.push({
      name: 'HTML Normalization: Message order is chronological (oldest first)',
      passed:
        normalized.messages.length === 2 &&
        first.includes('Hello, I need a website.') &&
        second.includes('Sure, I can help.'),
      message: `order[0]=${first.slice(0, 20)}...`,
    });

    // Test 8: Normalized shape matches the existing pipeline contract
    results.push({
      name: 'HTML Normalization: Produces the existing NormalizedConversation contract',
      passed:
        normalized.externalId === 'mock_gym_123' &&
        normalized.source === 'INSTAGRAM' &&
        normalized.participantNames.length > 0 &&
        normalized.fullTranscriptText.includes('Person A') &&
        typeof normalized.clientUsernameOrName === 'string' &&
        normalized.clientUsernameOrName.length > 0,
      message: `externalId=${normalized.externalId}, participants=${normalized.participantNames.length}`,
    });
  } catch (err: any) {
    results.push({ name: 'HTML Normalization tests exception', passed: false, message: err?.message });
  }

  // Test 9: Malformed HTML fails gracefully (null, no throw)
  try {
    const bad1 = InstagramHtmlParser.parseHtml('<<<not html at all &**', 'broken_folder');
    const bad2 = InstagramHtmlParser.parseHtml(
      '<html><body><div class="_a6-g"><h2>Broken</h2><div class="_3-95 _a6-p">',
      'broken_folder'
    );
    const missingFile = InstagramHtmlParser.parseFile(
      path.resolve(process.cwd(), 'tests', 'definitely_missing.html')
    );
    results.push({
      name: 'HTML Parser: Malformed HTML and missing files fail gracefully',
      passed:
        (bad1 === null || bad1.messages.length >= 0) &&
        (bad2 === null || bad2.messages.length >= 0) &&
        missingFile === null,
      message: `garbage=${bad1 === null ? 'null' : 'parsed'}, missing=${missingFile === null ? 'null' : 'parsed'}`,
    });
  } catch (err: any) {
    results.push({
      name: 'HTML Parser: Malformed HTML and missing files fail gracefully',
      passed: false,
      message: `Threw instead of failing gracefully: ${err?.message}`,
    });
  }

  // Test 10: Empty conversation (container present, no message text)
  try {
    const emptyHtml = `<html><head><title>Empty Thread</title></head><body>
      <div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2>Person A</h2><div class="_3-95 _a6-p"></div><div class="_3-94 _a6-o"></div></div>
      </body></html>`;
    const parsed = InstagramHtmlParser.parseHtml(emptyHtml, 'empty_folder');
    const normalized = parsed ? InstagramNormalizer.normalizeThread([parsed], 'empty_folder') : null;
    results.push({
      name: 'HTML Parser: Empty conversation is handled without crashing',
      passed:
        parsed !== null &&
        parsed.messages.length === 0 &&
        normalized !== null &&
        normalized.messages.length === 0,
      message: `raw messages=${parsed?.messages.length ?? 'null'}, normalized=${normalized?.messages.length ?? 'null'}`,
    });
  } catch (err: any) {
    results.push({ name: 'HTML Parser: Empty conversation handling', passed: false, message: err?.message });
  }

  // Test 11: Messages without timestamps keep document-relative order
  try {
    const noStampHtml = `<html><head><title>Undated Thread</title></head><body>
      <div class="pam _a6-g"><h2>Person A</h2><div class="_a6-p"><div>Newer message in document.</div></div></div>
      <div class="pam _a6-g"><h2>Person B</h2><div class="_a6-p"><div>Older message in document.</div></div></div>
      </body></html>`;
    const parsed = InstagramHtmlParser.parseHtml(noStampHtml, 'undated_folder');
    const normalized = InstagramNormalizer.normalizeThread([parsed!], 'undated_folder');
    const first = normalized.messages[0]?.content || '';
    const second = normalized.messages[1]?.content || '';
    results.push({
      name: 'HTML Parser: Missing timestamps preserve document-relative order',
      passed:
        normalized.messages.length === 2 &&
        first.includes('Older message') &&
        second.includes('Newer message'),
      message: `order[0]=${first.slice(0, 20)}...`,
    });
  } catch (err: any) {
    results.push({ name: 'HTML Parser: Missing timestamp ordering', passed: false, message: err?.message });
  }

  // Test 12: Participants derived only from HTML — no invented names
  try {
    const parsed = InstagramHtmlParser.parseHtml(mockConversationHtml(), 'mock_gym_123');
    const names = parsed?.participants.map((p) => p.name) || [];
    results.push({
      name: 'HTML Parser: Participants derived only from HTML (no invented names)',
      passed:
        names.includes('Mock Fitness Gym') &&
        names.includes('Person A') &&
        names.includes('Person B') &&
        names.length === 3,
      message: `participants=${names.length}`,
    });
  } catch (err: any) {
    results.push({ name: 'HTML Parser: Participant extraction', passed: false, message: err?.message });
  }

  // Test 13: Integration — discovery → parse → normalize produces a
  // pipeline-ready conversation using the existing normalizer
  try {
    const tmpRoot = path.resolve(process.cwd(), 'tests', 'tmp_html_pipeline');
    const convFolder = path.join(tmpRoot, 'messages', 'inbox', 'pipeline_thread_99');
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(convFolder, { recursive: true });
    fs.writeFileSync(path.join(convFolder, 'message_1.html'), mockConversationHtml());

    const discovery = InstagramHtmlParser.discover(tmpRoot);
    const parsed = InstagramHtmlParser.parseFile(discovery.conversationFiles[0]);
    const normalized = InstagramNormalizer.normalizeThread(
      [parsed!],
      path.dirname(discovery.conversationFiles[0])
    );

    const pipelineReady =
      normalized.externalId === 'pipeline_thread_99' &&
      normalized.messages.length === 2 &&
      normalized.fullTranscriptText.includes('Person A (') &&
      normalized.fullTranscriptText.includes('Person B (') &&
      normalized.metadata?.folderPathHint !== undefined;

    results.push({
      name: 'HTML Pipeline Integration: discovery → parse → normalize produces pipeline-ready conversation',
      passed: pipelineReady,
      message: `externalId=${normalized.externalId}, messages=${normalized.messages.length}`,
    });

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch (err: any) {
    results.push({ name: 'HTML Pipeline Integration test exception', passed: false, message: err?.message });
  }

  return results;
}
