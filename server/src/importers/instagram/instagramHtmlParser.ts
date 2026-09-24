import fs from 'fs';
import path from 'path';
import { parse, HTMLElement } from 'node-html-parser';
import {
  RawInstagramConversation,
  RawInstagramMessage,
} from './instagramParser.js';

export interface HtmlDiscoveryResult {
  rootPath: string;
  totalHtmlFiles: number;
  conversationFiles: string[];
  otherHtmlFiles: number;
  errors: string[];
}

/**
 * Reads Instagram HTML data exports (message_*.html) and converts them into
 * the SAME RawInstagramConversation shape produced by the JSON InstagramParser,
 * so the existing InstagramNormalizer and lead pipeline can consume both
 * formats interchangeably. Reads only — never writes into the export folder.
 */
export class InstagramHtmlParser {
  static getExtractedRoot(): string {
    return path.resolve(process.cwd(), 'data', 'instagram', 'extracted', 'Instagram-Leads');
  }

  /** Recursively discover conversation HTML files under the extracted export. */
  static discover(rootDir: string = this.getExtractedRoot()): HtmlDiscoveryResult {
    const result: HtmlDiscoveryResult = {
      rootPath: rootDir,
      totalHtmlFiles: 0,
      conversationFiles: [],
      otherHtmlFiles: 0,
      errors: [],
    };

    if (!fs.existsSync(rootDir)) {
      result.errors.push(`Extracted Instagram directory not found: ${rootDir}`);
      return result;
    }

    const walk = (dir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (err: any) {
        result.errors.push(`Cannot read directory: ${path.relative(rootDir, dir) || '.'}`);
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
          result.totalHtmlFiles++;
          if (/^message_\d+\.html$/i.test(entry.name)) {
            result.conversationFiles.push(full);
          } else {
            result.otherHtmlFiles++;
          }
        }
      }
    };

    try {
      walk(rootDir);
    } catch (err: any) {
      result.errors.push(`Discovery failed: ${err?.message || 'Unknown error'}`);
    }

    return result;
  }

  /** Read one HTML file from disk and parse it. Returns null on failure. */
  static parseFile(filePath: string): RawInstagramConversation | null {
    try {
      const html = fs.readFileSync(filePath, 'utf8');
      const folderName = path.basename(path.dirname(filePath));
      return this.parseHtml(html, folderName);
    } catch (err: any) {
      console.warn(`Could not read Instagram HTML file ${filePath}:`, err?.message || err);
      return null;
    }
  }

  /**
   * Parse Instagram HTML export content into a RawInstagramConversation.
   * Returns null when the HTML contains no recognizable message containers
   * (unsupported/corrupt structure). Returns a conversation with an empty
   * messages array when containers exist but hold no messages.
   */
  static parseHtml(html: string, titleFallback?: string): RawInstagramConversation | null {
    try {
      // Instagram uses <br /> for line breaks; convert to real newlines so
      // message text keeps its structure after DOM extraction.
      const prepared = html.replace(/<br\s*\/?>/gi, '\n');
      const root = parse(prepared);

      const titleEl = root.querySelector('title');
      const h1El = root.querySelector('h1');
      const title =
        (titleEl?.text || '').trim() ||
        (h1El?.text || '').trim() ||
        (titleFallback && titleFallback.trim()) ||
        'Untitled Conversation';

      // Message containers carry the obfuscated _a6-g class in HTML exports.
      const containers = root
        .getElementsByTagName('div')
        .filter((d) => (d.getAttribute('class') || '').includes('_a6-g'));

      if (containers.length === 0) {
        return null; // Not a conversation HTML file (unsupported structure)
      }

      const messages: RawInstagramMessage[] = [];
      const senders: string[] = [];

      for (const container of containers) {
        const senderEl = container.querySelector('h2');
        const senderName = (senderEl?.text || '').trim() || 'UNKNOWN';

        const content = this.extractContent(container);
        if (!content.text && !content.links.length) {
          continue; // skip empty message artifacts (normalizer would drop them anyway)
        }

        const timestampEl = this.findClass(container, '_a6-o');
        const timestampMs = this.parseTimestamp((timestampEl?.text || '').trim());

        let body = content.text;
        const missingLink = content.links.find((l) => !body.includes(l));
        const message: RawInstagramMessage = {
          sender_name: senderName,
          timestamp_ms: timestampMs ?? 0, // 0 = missing; ordering fixed below
          content: body || undefined,
        };
        if (missingLink) {
          message.share = { link: missingLink };
        }
        messages.push(message);

        if (senderName !== 'UNKNOWN' && !senders.includes(senderName)) {
          senders.push(senderName);
        }
      }

      this.assignMissingTimestamps(messages);

      // HTML exports order messages newest-first; participants = all senders
      // plus the thread counterpart represented by the conversation title.
      const participants = [...senders];
      if (title && title !== 'Untitled Conversation' && !participants.includes(title)) {
        participants.push(title);
      }

      return {
        title,
        participants: participants.map((name) => ({ name })),
        messages,
      };
    } catch (err: any) {
      console.warn('Instagram HTML parse error:', err?.message || err);
      return null;
    }
  }

  /** Find first descendant div whose class token list contains the given token. */
  private static findClass(root: HTMLElement, token: string): HTMLElement | undefined {
    return root
      .getElementsByTagName('div')
      .find((d: HTMLElement) => (d.getAttribute('class') || '').split(/\s+/).includes(token));
  }

  /**
   * Extract message text and links from a message container.
   *
   * Instagram HTML exports duplicate each message body: a rich copy (with
   * inline <a>/<br>) followed by a plain nested copy. We collect leaf text
   * blocks (divs with no child divs) and keep the LONGEST one, which selects
   * exactly one complete copy instead of concatenating duplicates.
   */
  private static extractContent(container: HTMLElement): { text: string; links: string[] } {
    let area = this.findClass(container, '_a6-p');

    if (!area) {
      // Fallback: first descendant div that is not the timestamp block.
      area = container
        .getElementsByTagName('div')
        .find(
          (d: HTMLElement) =>
            !(d.getAttribute('class') || '').split(/\s+/).includes('_a6-o') &&
            d.text.trim().length > 0
        );
    }
    if (!area) return { text: '', links: [] };

    const links: string[] = Array.from(
      new Set(
        area
          .getElementsByTagName('a')
          .map((a: HTMLElement) => (a.getAttribute('href') || '').trim())
          .filter((h: string) => /^https?:\/\//i.test(h))
      )
    );

    const leaves = area
      .getElementsByTagName('div')
      .filter((d: HTMLElement) => d.getElementsByTagName('div').length === 0);

    let best = '';
    for (const leaf of leaves) {
      const t = this.normalizeText(leaf.text);
      if (t.length > best.length) best = t;
    }
    if (!best) best = this.normalizeText(area.text);

    return { text: best, links };
  }

  private static normalizeText(raw: string): string {
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n')
      .trim();
  }

  /**
   * Parse export timestamp text such as "Mar 12, 2026 7:14 am".
   * Returns null when the text is missing or unparseable — never guessed.
   */
  private static parseTimestamp(raw: string): number | null {
    if (!raw) return null;
    const ampm = raw.replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase());
    let d = new Date(ampm);
    if (!Number.isNaN(d.getTime())) return d.getTime();
    d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.getTime();
    return null;
  }

  /**
   * Fill messages that had no parseable timestamp with synthetic values that
   * keep the normalizer's chronological ascending sort consistent with
   * document order: HTML exports are newest-first, so the last document entry
   * (oldest) receives the smallest value. Values are clamped below any real
   * timestamps. This is structural ordering metadata only — no dates are
   * invented or presented as real.
   */
  private static assignMissingTimestamps(messages: RawInstagramMessage[]): void {
    const missing = messages
      .map((m, i) => (m.timestamp_ms ? -1 : i))
      .filter((i) => i >= 0);
    if (missing.length === 0) return;

    const real = messages.filter((m) => m.timestamp_ms).map((m) => m.timestamp_ms);
    const base = real.length ? Math.min(...real) : Date.now();
    // missing[k] is a document index; doc order is newest-first, so doc index
    // 0 (newest) must get the LARGEST synthetic value among the missing set.
    missing.forEach((msgIdx, k) => {
      messages[msgIdx].timestamp_ms = base - (k + 1) * 1000;
    });
  }
}
