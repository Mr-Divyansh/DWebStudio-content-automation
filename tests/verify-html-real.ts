import { InstagramHtmlParser } from '../server/src/importers/instagram/instagramHtmlParser.js';
import { InstagramNormalizer } from '../server/src/importers/instagram/instagramNormalizer.js';
import path from 'path';

// Aggregate-only verification against the real local export.
// Prints COUNTS only — never message contents, senders, or titles.
const discovery = InstagramHtmlParser.discover();

let filesParsed = 0;
let filesFailed = 0;
let conversationsFound = 0;
let messagesFound = 0;
let emptyConversations = 0;

const byFolder: Record<string, string[]> = {};
for (const file of discovery.conversationFiles) {
  const folder = path.dirname(file);
  (byFolder[folder] ||= []).push(file);
}

for (const [folder, files] of Object.entries(byFolder)) {
  const raw = [];
  for (const f of files) {
    const parsed = InstagramHtmlParser.parseFile(f);
    if (parsed) {
      raw.push(parsed);
      filesParsed++;
    } else {
      filesFailed++;
    }
  }
  if (raw.length === 0) continue;
  const normalized = InstagramNormalizer.normalizeThread(raw, folder);
  if (normalized.messages.length === 0) {
    emptyConversations++;
    continue;
  }
  conversationsFound++;
  messagesFound += normalized.messages.length;
}

console.log(
  JSON.stringify(
    {
      htmlFilesDiscovered: discovery.totalHtmlFiles,
      conversationFilesDiscovered: discovery.conversationFiles.length,
      otherHtmlFiles: discovery.otherHtmlFiles,
      discoveryErrors: discovery.errors.length,
      foldersScanned: Object.keys(byFolder).length,
      filesParsed,
      filesFailed,
      conversationsFound,
      messagesFound,
      emptyConversations,
    },
    null,
    2
  )
);
