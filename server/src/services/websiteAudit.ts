/**
 * P2 — Deterministic website audit.
 *
 * Every value produced here is an observable fact read from an HTTP response or from the returned
 * HTML/JSON-LD. No scoring, no opinions: an unavailable value is `null` / "missing", never a guess.
 * Subjective statements such as "bad website" are deliberately not part of the output; only
 * documented, reproducible rules (see AUDIT_RULES) classify a link as booking/contact/social.
 *
 * Uses the existing project dependency `node-html-parser` and the P8 safe HTTP client.
 * No new dependency is introduced (the `ai-search-audit` npm package was inspected and rejected â€”
 * it is unpublished from the npm registry and its `dist/` output is build-only, so it cannot be
 * installed from either the registry or a git URL).
 */

import { parse } from 'node-html-parser';
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_TIMEOUT_MS,
  RESEARCH_USER_AGENT,
  SafeFetchOptions,
  safeFetch,
  parseUrlInput,
} from './httpClient.js';

export type ResearchEvidenceType =
  | 'OBSERVED_FACT'
  | 'OBSERVED_ABSENCE'
  | 'UNREACHABLE'
  | 'NOT_EVALUATED'
  | 'AI_INFERENCE';

export interface ResearchEvidenceDraft {
  claim: string;
  observation: string;
  sourceUrl: string;
  fetchedAt: string;
  evidenceType: ResearchEvidenceType;
  confidence: 'high' | 'medium' | 'low';
  /** Optional verbatim supporting quote. Present for AI-inferred items, absent for direct observations. */
  quote?: string | null;
}

export interface WebsiteAuditResult {
  requestedUrl: string;
  finalUrl: string | null;
  fetchedAt: string;
  reachable: boolean;
  httpStatus: number | null;
  statusText: string | null;
  /**
   * Phase 3 (P3): true when the server answered with an access/bot-protection status
   * (e.g. 403). The page exists, but its content is NOT the business website, so no
   * HTML-derived business fact is extracted from it.
   */
  blocked: boolean;
  httpsAvailable: boolean;
  httpsStatus: number | null;
  httpsError: string | null;
  httpsRedirectsToHttp: boolean;
  responseTimeMs: number | null;
  redirectCount: number;
  redirectChain: string[];
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  language: string | null;
  viewportMetaPresent: boolean;
  viewportMetaContent: string | null;
  openGraphTitle: string | null;
  openGraphSiteName: string | null;
  h1Count: number | null;
  h1Text: string | null;
  headingCounts: { h1: number; h2: number; h3: number };
  imageCount: number;
  imagesMissingAlt: number;
  robotsTxtPresent: boolean | null;
  robotsTxtStatus: number | null;
  robotsTxtPresenceChecked: boolean;
  bookingLinkDetected: boolean;
  bookingLinks: string[];
  contactLinkDetected: boolean;
  contactLinks: string[];
  emailLinks: string[];
  phoneLinks: string[];
  socialLinks: Array<{ platform: string; url: string }>;
  structuredDataTypes: string[];
  organizationName: string | null;
  organizationAddress: {
    street: string | null;
    locality: string | null;
    region: string | null;
    country: string | null;
  } | null;
  phoneFromPage: string | null;
  emailFromPage: string | null;
  servicesFromStructuredData: string[] | null;
  textExtract: string | null;
  htmlAnalyzed: boolean;
  observations: ResearchEvidenceDraft[];
  warnings: string[];
  errors: Array<{ code: string; message: string }>;
}

/**
 * Documented, reproducible classification rules. A link is only reported as booking/contact/social
 * when it matches one of these rules; nothing is inferred.
 */
export const AUDIT_RULES = {
  bookingKeywords: [
    'book',
    'booking',
    'bookings',
    'book now',
    'book-now',
    'book online',
    'schedule',
    'scheduling',
    'appointment',
    'appointments',
    'reserve',
    'reservation',
    'reservations',
  ],
  bookingHosts: [
    'calendly.com',
    'cal.com',
    'tidycal.com',
    'savvycal.com',
    'youcanbook.me',
    'setmore.com',
    'acuityscheduling.com',
    'squareup.com',
    'square.site',
    'booksy.com',
    'fresha.com',
    'mindbodyonline.com',
    'vagaro.com',
    'oncehub.com',
    'simplybook.me',
    'meetings.hubspot.com',
    'zoho.com',
  ],
  contactKeywords: [
    'contact',
    'contact us',
    'contact-us',
    'get in touch',
    'enquire',
    'enquiry',
    'talk to us',
    'reach out',
    'find us',
  ],
  socialPlatforms: [
    { platform: 'instagram', hostPattern: /(^|\.)instagram\.com$/i },
    { platform: 'facebook', hostPattern: /(^|\.)facebook\.com$/i },
    { platform: 'linkedin', hostPattern: /(^|\.)linkedin\.com$/i },
    { platform: 'youtube', hostPattern: /(^|\.)(youtube\.com|youtu\.be)$/i },
    { platform: 'tiktok', hostPattern: /(^|\.)tiktok\.com$/i },
    { platform: 'twitter', hostPattern: /(^|\.)(twitter\.com|x\.com)$/i },
    { platform: 'pinterest', hostPattern: /(^|\.)pinterest\.[a-z.]+$/i },
    { platform: 'whatsapp', hostPattern: /(^|\.)(wa\.me|whatsapp\.com)$/i },
    { platform: 'threads', hostPattern: /(^|\.)threads\.net$/i },
    { platform: 'telegram', hostPattern: /(^|\.)(t\.me|telegram\.me)$/i },
  ],
  /** Schema.org node types whose declared fields describe a business. Membership is deterministic. */
  businessSchemaTypes: new Set([
    'Organization',
    'LocalBusiness',
    'Store',
    'AnimalShelter',
    'ArchiveOrganization',
    'AutomotiveBusiness',
    'ChildCare',
    'Dentist',
    'DryCleaningOrLaundry',
    'EmergencyService',
    'FinancialService',
    'FoodEstablishment',
    'GovernmentOffice',
    'HealthAndBeautyBusiness',
    'HomeAndConstructionBusiness',
    'InternetCafe',
    'LegalService',
    'LodgingBusiness',
    'MedicalBusiness',
    'ProfessionalService',
    'RealEstateAgent',
    'RecyclingCenter',
    'SelfStorage',
    'ShoppingCenter',
    'SportsActivityLocation',
    'TouristInformationCenter',
    'TravelAgency',
  ]),
} as const;

const MAX_LISTED_LINKS = 5;
const MAX_TEXT_EXTRACT_CHARS = 4000;

/**
 * Phase 3 (P3) — HTTP statuses that mean "you did not get the real page".
 * A 403/429 answer is usually a bot-protection or access-denied page, so its HTML is NOT the
 * business website and must never be turned into business claims (title, links, services...).
 */
export const BLOCK_HTTP_STATUSES = new Set([401, 403, 407, 429, 451]);

export function isBlockHttpStatus(status: number | null | undefined): boolean {
  return typeof status === 'number' && BLOCK_HTTP_STATUSES.has(status);
}

export function normalizeWhitespace(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => Boolean(value))));
}


interface ExtractedLink {
  href: string;
  absolute: string | null;
  hostname: string | null;
  text: string;
}

function toAbsoluteUrl(href: string, baseUrl: string): string | null {
  try {
    const parsed = new URL(href, baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function hostnameOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function extractLinks(root: ReturnType<typeof parse>, baseUrl: string): ExtractedLink[] {
  const anchors = root.querySelectorAll('a');
  return anchors.map((anchor) => {
    const href = (anchor.getAttribute('href') || '').trim();
    const absolute = href ? toAbsoluteUrl(href, baseUrl) : null;
    return {
      href,
      absolute,
      hostname: hostnameOf(absolute),
      text: normalizeWhitespace(anchor.textContent),
    };
  });
}

function matchesKeyword(values: string[], keywords: readonly string[]): boolean {
  const haystack = values.join(' ').toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function matchesHostList(hostname: string | null, hosts: readonly string[]): boolean {
  if (!hostname) return false;
  const host = hostname.toLowerCase();
  return hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

function extractEmailFromMailto(href: string): string | null {
  const raw = href.replace(/^mailto:/i, '').split('?')[0].trim();
  if (!raw) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw)) return null;
  return raw;
}

function extractPhoneFromTel(href: string): string | null {
  const raw = href.replace(/^tel:/i, '').split('?')[0].trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9+]/g, '');
  if (cleaned.replace(/\D/g, '').length < 6) return null;
  return cleaned;
}

function collectJsonLdNodes(root: ReturnType<typeof parse>): any[] {
  const nodes: any[] = [];
  // Match the attribute in code rather than relying on a compound CSS selector containing a MIME
  // value with a slash. Some node-html-parser versions do not match that selector reliably.
  for (const script of root.querySelectorAll('script')) {
    if ((script.getAttribute('type') || '').trim().toLowerCase() !== 'application/ld+json') continue;
    const raw = (script.textContent || '').trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const queue: any[] = Array.isArray(parsed) ? [...parsed] : [parsed];
      let index = 0;
      while (index < queue.length) {
        const node = queue[index++];
        if (!node || typeof node !== 'object') continue;
        nodes.push(node);
        if (Array.isArray(node['@graph'])) queue.push(...node['@graph']);
      }
    } catch {
      // Malformed JSON-LD is ignored: it is simply not usable evidence.
    }
  }
  return nodes;
}

function typeListOf(node: any): string[] {
  const type = node?.['@type'];
  if (typeof type === 'string') return [type];
  if (Array.isArray(type)) return type.filter((t) => typeof t === 'string');
  return [];
}

function firstString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return normalizeWhitespace(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item);
      if (found) return found;
    }
  }
  if (value && typeof value === 'object') {
    const inner = (value as any).name;
    if (typeof inner === 'string' && inner.trim()) return normalizeWhitespace(inner);
  }
  return null;
}

function collectServices(node: any): string[] {
  const names: string[] = [];

  const fromCatalog = node?.hasOfferCatalog?.itemListElement;
  if (Array.isArray(fromCatalog)) {
    for (const entry of fromCatalog) {
      const name = firstString(entry?.itemOffered) || firstString(entry?.name);
      if (name) names.push(name);
    }
  }

  const fromOffers = node?.makesOffer;
  if (Array.isArray(fromOffers)) {
    for (const entry of fromOffers) {
      const name = firstString(entry?.itemOffered) || firstString(entry?.name);
      if (name) names.push(name);
    }
  }

  return dedupe(names);
}

export interface WebsiteAuditOptions {
  timeoutMs?: number;
  maxBytes?: number;
  /** Skip the extra https:// probe (default: enabled when the page was served over http). */
  checkHttps?: boolean;
  /** Skip the extra /robots.txt probe (default: enabled). */
  checkRobotsTxt?: boolean;
  /**
   * TEST-ONLY passthrough for the safe HTTP client (e.g. allow a loopback mock server).
   * Routes never populate this; production callers leave it undefined.
   */
  fetchOptions?: SafeFetchOptions;
}

function notEvaluatedEvidence(
  sourceUrl: string,
  claim: string,
  observation: string,
  fetchedAt: string,
): ResearchEvidenceDraft {
  return { claim, observation, sourceUrl, fetchedAt, evidenceType: 'NOT_EVALUATED', confidence: 'high' };
}

function buildObservations(result: WebsiteAuditResult): ResearchEvidenceDraft[] {
  const at = result.fetchedAt;
  const url = result.finalUrl || result.requestedUrl;

  const facts: ResearchEvidenceDraft[] = [];

  const push = (
    claim: string,
    observation: string,
    evidenceType: ResearchEvidenceType,
    confidence: 'high' | 'medium' | 'low' = 'high',
  ) => {
    facts.push({ claim, observation, sourceUrl: url, fetchedAt: at, evidenceType, confidence });
  };

  if (!result.reachable) {
    push(
      'Website reachable',
      `Website unreachable (${result.errors[0]?.code || 'UNKNOWN'}): ${result.errors[0]?.message || 'no response received'}`,
      'UNREACHABLE',
    );
    return facts.slice(0, 30);
  }

  push('Website reachable', 'Website reachable: yes', 'OBSERVED_FACT');
  push(
    'Homepage response',
    `Homepage response: ${result.httpStatus ?? 'unknown'}`,
    'OBSERVED_FACT',
  );

  // Phase 3 (P3): 403 / access-denied responses. The HTTP facts above are kept, but the body is a
  // block page — so the title/booking/contact/link checks below are explicitly NOT evaluated
  // rather than being read as if they described the real business website.
  if (result.blocked) {
    push(
      'Access blocked',
      `Access to the page content was blocked (HTTP ${result.httpStatus ?? 'unknown'}). The response body is a block/access page, not the business website, so no page content was analyzed.`,
      'NOT_EVALUATED',
    );
    return facts.slice(0, 20);
  }
  push('HTTPS', result.httpsAvailable ? 'HTTPS: yes' : 'HTTPS: no', result.httpsAvailable ? 'OBSERVED_FACT' : 'OBSERVED_ABSENCE');

  if (result.redirectCount > 0) {
    push('Redirects', `Redirects followed: ${result.redirectCount} (final URL: ${result.finalUrl})`, 'OBSERVED_FACT');
  }

  push(
    'Title tag',
    result.title ? `Title tag: present — "${truncate(result.title, 120)}"` : 'Title tag: missing',
    result.title ? 'OBSERVED_FACT' : 'OBSERVED_ABSENCE',
  );
  push(
    'Meta description',
    result.metaDescription
      ? `Meta description: present (${result.metaDescription.length} characters)`
      : 'Meta description: missing',
    result.metaDescription ? 'OBSERVED_FACT' : 'OBSERVED_ABSENCE',
  );
  push(
    'Canonical link',
    result.canonicalUrl ? `Canonical link: present (${truncate(result.canonicalUrl, 120)})` : 'Canonical link: missing',
    result.canonicalUrl ? 'OBSERVED_FACT' : 'OBSERVED_ABSENCE',
  );
  push(
    'Viewport meta tag',
    result.viewportMetaPresent
      ? `Viewport meta tag: present${result.viewportMetaContent ? ` (${truncate(result.viewportMetaContent, 80)})` : ''}`
      : 'Viewport meta tag: missing',
    result.viewportMetaPresent ? 'OBSERVED_FACT' : 'OBSERVED_ABSENCE',
  );
  push(
    'Language attribute',
    result.language ? `Language attribute: ${result.language}` : 'Language attribute: missing',
    result.language ? 'OBSERVED_FACT' : 'OBSERVED_ABSENCE',
  );
  push('H1 heading', `H1 count: ${result.h1Count ?? 0}`, 'OBSERVED_FACT');
  if (result.h1Text) {
    push('H1 text', `H1 text: "${truncate(result.h1Text, 120)}"`, 'OBSERVED_FACT');
  }
  push(
    'Image alt attributes',
    `Images missing alt attribute: ${result.imagesMissingAlt} of ${result.imageCount}`,
    'OBSERVED_FACT',
  );
  push(
    'Booking link',
    result.bookingLinkDetected
      ? `Booking link detected: yes (${result.bookingLinks[0]})`
      : 'Booking link detected: no',
    result.bookingLinkDetected ? 'OBSERVED_FACT' : 'OBSERVED_ABSENCE',
  );
  push(
    'Contact link',
    result.contactLinkDetected
      ? `Contact link detected: yes (${result.contactLinks[0]})`
      : 'Contact link detected: no',
    result.contactLinkDetected ? 'OBSERVED_FACT' : 'OBSERVED_ABSENCE',
  );
  push(
    'Public email published',
    result.emailFromPage ? 'Public email published: yes (mailto link on homepage)' : 'Public email published: no',
    result.emailFromPage ? 'OBSERVED_FACT' : 'OBSERVED_ABSENCE',
  );
  push(
    'Public phone published',
    result.phoneFromPage ? 'Public phone published: yes (tel link on homepage)' : 'Public phone published: no',
    result.phoneFromPage ? 'OBSERVED_FACT' : 'OBSERVED_ABSENCE',
  );
  push(
    'Social profile links',
    result.socialLinks.length > 0
      ? `Social profile links detected: ${result.socialLinks.length} (${dedupe(result.socialLinks.map((s) => s.platform)).join(', ')})`
      : 'Social profile links detected: none',
    result.socialLinks.length > 0 ? 'OBSERVED_FACT' : 'OBSERVED_ABSENCE',
  );
  push(
    'Structured data',
    result.structuredDataTypes.length > 0
      ? `JSON-LD structured data: ${result.structuredDataTypes.length} node(s) (${dedupe(result.structuredDataTypes).join(', ')})`
      : 'JSON-LD structured data: none detected',
    result.structuredDataTypes.length > 0 ? 'OBSERVED_FACT' : 'OBSERVED_ABSENCE',
  );
  if (result.organizationName) {
    push('Business name', `Business name (JSON-LD): ${result.organizationName}`, 'OBSERVED_FACT');
  }
  if (result.organizationAddress) {
    const address = [
      result.organizationAddress.street,
      result.organizationAddress.locality,
      result.organizationAddress.region,
      result.organizationAddress.country,
    ].filter(Boolean).join(', ');
    if (address) push('Business location', `Business location (JSON-LD): ${address}`, 'OBSERVED_FACT');
  }
  if (result.servicesFromStructuredData?.length) {
    push(
      'Public services',
      `Public services (JSON-LD): ${result.servicesFromStructuredData.join(', ')}`,
      'OBSERVED_FACT',
    );
  }
  if (result.robotsTxtPresenceChecked) {
    push(
      'robots.txt',
      result.robotsTxtPresent ? 'robots.txt: present' : 'robots.txt: missing',
      result.robotsTxtPresent ? 'OBSERVED_FACT' : 'OBSERVED_ABSENCE',
    );
  }
  if (result.responseTimeMs !== null) {
    push('Homepage response time', `Homepage response time: ${result.responseTimeMs} ms`, 'OBSERVED_FACT');
  }

  return facts.slice(0, 20);
}

/** Assembles the final audit result and derives the deterministic observation list. */
function finalizeAudit(
  requestedUrl: string,
  fetchedAt: string,
  errors: Array<{ code: string; message: string }>,
  extras: Partial<WebsiteAuditResult> = {},
): WebsiteAuditResult {
  const base: WebsiteAuditResult = {
    requestedUrl,
    finalUrl: null,
    fetchedAt,
    reachable: false,
    httpStatus: null,
    statusText: null,
    blocked: false,
    httpsAvailable: false,
    httpsStatus: null,
    httpsError: null,
    httpsRedirectsToHttp: false,
    responseTimeMs: null,
    redirectCount: 0,
    redirectChain: [],
    title: null,
    metaDescription: null,
    canonicalUrl: null,
    language: null,
    viewportMetaPresent: false,
    viewportMetaContent: null,
    openGraphTitle: null,
    openGraphSiteName: null,
    h1Count: null,
    h1Text: null,
    headingCounts: { h1: 0, h2: 0, h3: 0 },
    imageCount: 0,
    imagesMissingAlt: 0,
    robotsTxtPresent: null,
    robotsTxtStatus: null,
    robotsTxtPresenceChecked: false,
    bookingLinkDetected: false,
    bookingLinks: [],
    contactLinkDetected: false,
    contactLinks: [],
    emailLinks: [],
    phoneLinks: [],
    socialLinks: [],
    structuredDataTypes: [],
    organizationName: null,
    organizationAddress: null,
    phoneFromPage: null,
    emailFromPage: null,
    servicesFromStructuredData: null,
    textExtract: null,
    htmlAnalyzed: false,
    observations: [],
    warnings: [],
    errors,
  };

  const merged: WebsiteAuditResult = { ...base, ...extras };
  if (!extras.observations) {
    merged.observations = buildObservations(merged);
  }
  return merged;
}

export class WebsiteAuditor {
  /**
   * Audits a single public URL. Never throws: unreachable sites, HTTP errors, TLS failures,
   * redirect loops and malformed HTML all return a structured, partial result.
   */
  static async audit(urlInput: string, options: WebsiteAuditOptions = {}): Promise<WebsiteAuditResult> {
    const fetchedAt = new Date().toISOString();
    const parsed = parseUrlInput(urlInput);

    if (!parsed.ok) {
      const rawUrl = typeof urlInput === 'string' ? urlInput : String(urlInput ?? '');
      return finalizeAudit(rawUrl, fetchedAt, [{ code: parsed.error.code, message: parsed.error.message }], {
        observations: [notEvaluatedEvidence(rawUrl, 'URL', `URL rejected: ${parsed.error.message}`, fetchedAt)],
      });
    }

    const requestedUrl = parsed.url.toString();
    const timeoutMs = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    const maxBytes = options.maxBytes && options.maxBytes > 0 ? options.maxBytes : DEFAULT_MAX_BYTES;
    const fetchOptions: SafeFetchOptions = { timeoutMs, maxBytes, ...(options.fetchOptions || {}) };

    const warnings: string[] = [];
    const errors: Array<{ code: string; message: string }> = [];

    const page = await safeFetch(requestedUrl, { ...fetchOptions, method: 'GET' });
    if (page.error) errors.push({ code: page.error.code, message: page.error.message });
    if (page.bodyTruncated) {
      warnings.push(`Response body was truncated at ${maxBytes} bytes; only the beginning of the page was analysed.`);
    }

    const reachable = page.httpStatus !== null;
    const finalUrl = page.finalUrl || requestedUrl;
    // Phase 3 (P3): 403-style answers are recorded as BLOCKED, not as a normal audited page.
    const blocked = reachable && isBlockHttpStatus(page.httpStatus);

    const baseExtras: Partial<WebsiteAuditResult> = {
      finalUrl,
      reachable,
      httpStatus: page.httpStatus,
      statusText: page.statusText,
      blocked,
      redirectCount: page.redirectCount,
      redirectChain: page.redirectChain,
      responseTimeMs: page.responseTimeMs,
      warnings,
    };

    if (blocked) {
      warnings.push(
        `The server answered HTTP ${page.httpStatus} (access/bot-protection). The response body is a block page, so HTML-derived business checks were not evaluated.`,
      );
    }

    const httpsInfo = await this.checkHttps(finalUrl, page.httpStatus, options, fetchOptions);
    const robots = reachable ? await this.checkRobotsTxt(finalUrl, options, fetchOptions) : {};
    const combined: Partial<WebsiteAuditResult> = { ...baseExtras, ...httpsInfo, ...robots };

    if (!reachable) {
      return finalizeAudit(requestedUrl, fetchedAt, errors, combined);
    }

    // Phase 3 (P3): a block page is never parsed for business facts (title, links, services...).
    if (blocked) {
      return finalizeAudit(requestedUrl, fetchedAt, errors, {
        ...combined,
        observations: [
          ...buildObservations(finalizeAudit(requestedUrl, fetchedAt, errors, { ...combined, observations: [] })),
          notEvaluatedEvidence(finalUrl, 'HTML analysis', 'HTML analysis: not evaluated (HTTP access/bot-protection page)', fetchedAt),
        ],
      });
    }

    const html = page.body || '';
    if (!html.trim()) {
      warnings.push('The site returned no HTML/text body, so HTML-derived checks were skipped.');
      return finalizeAudit(requestedUrl, fetchedAt, errors, {
        ...combined,
        observations: [
          ...buildObservations(finalizeAudit(requestedUrl, fetchedAt, errors, { ...combined, observations: [] })),
          notEvaluatedEvidence(finalUrl, 'HTML analysis', 'HTML analysis: skipped (no HTML body returned)', fetchedAt),
        ],
      });
    }

    let parsedFacts: Partial<WebsiteAuditResult>;
    try {
      parsedFacts = this.extractHtmlFacts(html, finalUrl);
    } catch (err: any) {
      errors.push({ code: 'HTML_PARSE_ERROR', message: `HTML could not be parsed (${err?.message || 'unknown error'}).` });
      warnings.push('Page HTML could not be parsed; structural checks are unavailable.');
      return finalizeAudit(requestedUrl, fetchedAt, errors, {
        ...combined,
        observations: [
          ...buildObservations(finalizeAudit(requestedUrl, fetchedAt, errors, { ...combined, observations: [] })),
          notEvaluatedEvidence(finalUrl, 'HTML analysis', 'HTML analysis: skipped (page HTML could not be parsed)', fetchedAt),
        ],
      });
    }

    return finalizeAudit(requestedUrl, fetchedAt, errors, { ...combined, ...parsedFacts });
  }

  /** Deterministic checks derived from the returned HTML. */
  static extractHtmlFacts(html: string, finalUrl: string): Partial<WebsiteAuditResult> {
    const root = parse(html);
    const links = extractLinks(root, finalUrl);
    const jsonLdNodes = collectJsonLdNodes(root);

    const title = normalizeWhitespace(root.querySelector('title')?.textContent) || null;
    const language = normalizeWhitespace(root.querySelector('html')?.getAttribute('lang')) || null;

    const canonicalHref = root.querySelector('link[rel="canonical"]')?.getAttribute('href');
    const canonicalUrl = canonicalHref ? toAbsoluteUrl(canonicalHref, finalUrl) : null;

    let metaDescription: string | null = null;
    let viewportMetaPresent = false;
    let viewportMetaContent: string | null = null;
    let openGraphTitle: string | null = null;
    let openGraphSiteName: string | null = null;

    for (const meta of root.querySelectorAll('meta')) {
      const key = (
        meta.getAttribute('name') ||
        meta.getAttribute('property') ||
        meta.getAttribute('itemprop') ||
        ''
      ).toLowerCase();
      const content = meta.getAttribute('content');
      if (!key || content == null) continue;

      if (key === 'description' && !metaDescription) metaDescription = normalizeWhitespace(content) || null;
      if (key === 'viewport') {
        viewportMetaPresent = true;
        viewportMetaContent = normalizeWhitespace(content) || null;
      }
      if (key === 'og:title' && !openGraphTitle) openGraphTitle = normalizeWhitespace(content) || null;
      if (key === 'og:site_name' && !openGraphSiteName) openGraphSiteName = normalizeWhitespace(content) || null;
    }

    const h1Elements = root.querySelectorAll('h1');
    const h1Count = h1Elements.length;
    const h1Text = h1Count > 0 ? normalizeWhitespace(h1Elements.map((h) => h.textContent).join(' ')) || null : null;
    const headingCounts = {
      h1: h1Count,
      h2: root.querySelectorAll('h2').length,
      h3: root.querySelectorAll('h3').length,
    };

    const images = root.querySelectorAll('img');
    const imagesMissingAlt = images.filter((img) => {
      const alt = img.getAttribute('alt');
      return alt == null || !String(alt).trim();
    }).length;

    const bookingLinks = dedupe(
      links
        .filter((link) => {
          if (matchesHostList(link.hostname, AUDIT_RULES.bookingHosts)) return true;
          return matchesKeyword([link.href, link.text], AUDIT_RULES.bookingKeywords);
        })
        .map((link) => link.absolute || link.href),
    ).slice(0, MAX_LISTED_LINKS);

    const contactLinks = dedupe(
      links
        .filter((link) => !link.href.toLowerCase().startsWith('mailto:'))
        .filter((link) => matchesKeyword([link.href, link.text], AUDIT_RULES.contactKeywords))
        .map((link) => link.absolute || link.href),
    ).slice(0, MAX_LISTED_LINKS);

    const emailLinks = dedupe(
      links
        .filter((link) => link.href.toLowerCase().startsWith('mailto:'))
        .map((link) => extractEmailFromMailto(link.href))
        .filter((value): value is string => Boolean(value)),
    ).slice(0, MAX_LISTED_LINKS);

    const phoneLinks = dedupe(
      links
        .filter((link) => link.href.toLowerCase().startsWith('tel:'))
        .map((link) => extractPhoneFromTel(link.href))
        .filter((value): value is string => Boolean(value)),
    ).slice(0, MAX_LISTED_LINKS);

    const socialLinks: Array<{ platform: string; url: string }> = [];
    for (const link of links) {
      if (!link.hostname || !link.absolute) continue;
      for (const platform of AUDIT_RULES.socialPlatforms) {
        if (platform.hostPattern.test(link.hostname)) {
          socialLinks.push({ platform: platform.platform, url: link.absolute });
          break;
        }
      }
    }
    const dedupedSocialLinks = socialLinks
      .filter((entry, index, all) => all.findIndex((other) => other.url === entry.url) === index)
      .slice(0, MAX_LISTED_LINKS);

    const structuredDataTypes: string[] = [];
    let organizationName: string | null = null;
    let organizationAddress: WebsiteAuditResult['organizationAddress'] = null;
    let phoneFromStructuredData: string | null = null;
    let emailFromStructuredData: string | null = null;
    let services: string[] = [];

    for (const node of jsonLdNodes) {
      for (const type of typeListOf(node)) structuredDataTypes.push(type);

      const types = typeListOf(node);
      const looksLikeBusiness = types.some((type) => AUDIT_RULES.businessSchemaTypes.has(type));
      if (!looksLikeBusiness) continue;

      if (!organizationName) organizationName = firstString(node?.name) || firstString(node?.legalName);

      const address = node?.address;
      if (!organizationAddress && address && typeof address === 'object') {
        const candidate = {
          street: firstString(address.streetAddress),
          locality: firstString(address.addressLocality),
          region: firstString(address.addressRegion),
          country: firstString(address.addressCountry),
        };
        if (candidate.street || candidate.locality || candidate.region || candidate.country) {
          organizationAddress = candidate;
        }
      }

      if (!phoneFromStructuredData) phoneFromStructuredData = firstString(node?.telephone);
      if (!emailFromStructuredData) emailFromStructuredData = firstString(node?.email);
      services = [...services, ...collectServices(node)];
    }

    // Remove non-visible nodes before building the text extract used by the optional AI step.
    for (const element of root.querySelectorAll('script, style, noscript, template')) {
      element.remove();
    }
    const visibleText = normalizeWhitespace(root.querySelector('body')?.textContent || root.textContent || '');

    return {
      htmlAnalyzed: true,
      title,
      metaDescription,
      canonicalUrl,
      language,
      viewportMetaPresent,
      viewportMetaContent,
      openGraphTitle,
      openGraphSiteName,
      h1Count,
      h1Text,
      headingCounts,
      imageCount: images.length,
      imagesMissingAlt,
      bookingLinkDetected: bookingLinks.length > 0,
      bookingLinks,
      contactLinkDetected: contactLinks.length > 0,
      contactLinks,
      emailLinks,
      phoneLinks,
      socialLinks: dedupedSocialLinks,
      structuredDataTypes: dedupe(structuredDataTypes),
      organizationName,
      organizationAddress,
      phoneFromPage: phoneFromStructuredData || phoneLinks[0] || null,
      emailFromPage: emailFromStructuredData || emailLinks[0] || null,
      servicesFromStructuredData: services.length > 0 ? dedupe(services) : null,
      textExtract: visibleText ? truncate(visibleText, MAX_TEXT_EXTRACT_CHARS) : null,
    };
  }

  /**
   * Deterministic HTTPS availability check: when the page was served over http://, a single
   * https:// probe is attempted. Failure is reported as a fact ("HTTPS: no"), never as an opinion.
   */
  static async checkHttps(
    finalUrl: string,
    httpStatus: number | null,
    options: WebsiteAuditOptions,
    fetchOptions: SafeFetchOptions,
  ): Promise<Partial<WebsiteAuditResult>> {
    let url: URL;
    try {
      url = new URL(finalUrl);
    } catch {
      return { httpsAvailable: false, httpsStatus: null, httpsError: 'Final URL could not be parsed.' };
    }

    if (url.protocol === 'https:') {
      return { httpsAvailable: true, httpsStatus: httpStatus, httpsError: null, httpsRedirectsToHttp: false };
    }

    if (options.checkHttps === false) {
      return { httpsAvailable: false, httpsStatus: null, httpsError: null, httpsRedirectsToHttp: false };
    }

    const httpsUrl = `https://${url.host}${url.pathname}${url.search}`;
    const probe = await safeFetch(httpsUrl, { ...fetchOptions, method: 'HEAD', maxRedirects: 2 });
    const ok = probe.httpStatus !== null && probe.httpStatus >= 200 && probe.httpStatus < 400;

    return {
      httpsAvailable: ok,
      httpsStatus: probe.httpStatus,
      httpsError: ok ? null : probe.error?.message || 'HTTPS probe did not return a successful response.',
      httpsRedirectsToHttp: probe.finalUrl.startsWith('http://'),
    };
  }

  /** Deterministic robots.txt presence check (presence only, never an SEO judgement). */
  static async checkRobotsTxt(
    finalUrl: string,
    options: WebsiteAuditOptions,
    fetchOptions: SafeFetchOptions,
  ): Promise<Partial<WebsiteAuditResult>> {
    if (options.checkRobotsTxt === false) {
      return { robotsTxtPresenceChecked: false };
    }

    let robotsUrl: string;
    try {
      robotsUrl = new URL('/robots.txt', finalUrl).toString();
    } catch {
      return { robotsTxtPresenceChecked: false };
    }

    const probe = await safeFetch(robotsUrl, { ...fetchOptions, method: 'GET', maxBytes: 64 * 1024 });
    if (probe.error && probe.httpStatus === null) {
      return { robotsTxtPresenceChecked: true, robotsTxtPresent: false, robotsTxtStatus: probe.httpStatus };
    }

    const body = (probe.body || '').trim();
    const looksLikeHtmlErrorPage = body.startsWith('<');
    const present = probe.httpStatus === 200 && body.length > 0 && !looksLikeHtmlErrorPage;

    return { robotsTxtPresenceChecked: true, robotsTxtPresent: present, robotsTxtStatus: probe.httpStatus };
  }
}
