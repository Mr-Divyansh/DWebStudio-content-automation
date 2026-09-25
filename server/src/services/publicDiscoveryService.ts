import { getGeminiClient, GEMINI_MODEL, GEMINI_TIMEOUT_MS } from '../ai/gemini.js';
import { prisma } from '../database/client.js';
import { parseUrlInput, safeFetch } from './httpClient.js';

const CATEGORY_MAP: Record<string, string> = {
  gym: 'Gym', fitness: 'Gym', restaurant: 'Restaurant', salon: 'Salon',
  coaching: 'Coaching', coach: 'Coaching', creator: 'Creator', startup: 'Startup',
  'local business': 'Local business', 'service business': 'Service business', tuition: 'Coaching',
};

interface DiscoveryCandidate {
  businessName: string; category: string; city: string; website: string | null;
  instagramUrl: string | null; facebookUrl: string | null; publicEmail: string | null;
  publicPhone: string | null; services: string[]; sourceUrl: string; sourceTitle: string;
  evidenceQuote: string; apparentSize: string; socialActivity: string;
  websiteOpportunity: string; confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface PublicDiscoveryResult { created: number; skipped: number; warnings: string[] }

function isSafePublicUrl(value: string): boolean {
  try {
    const parsed = parseUrlInput(value);
    if (!parsed.ok) return false;
    const url = new URL(parsed.url);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch { return false; }
}

function isAllowedSocialUrl(value: string, platform: 'instagram' | 'facebook'): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return url.protocol === 'https:' && [host, `www.${host}`].includes(`${platform}.com`);
  } catch { return false; }
}

/** Canonical key used to compare a candidate source with Gemini grounding sources. */
function sourceKey(value: string): string {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.hostname.toLowerCase()}${path}${url.search}`.replace(/#.*$/, '');
  } catch {
    return value.trim().toLowerCase().replace(/#.*$/, '').replace(/\/+$/, '');
  }
}

/** Normalizes common HTML entities/whitespace for conservative source verification. */
function sourceText(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function mentionsSource(haystack: string, value: string | null): boolean {
  if (!value) return true;
  const needle = sourceText(value);
  if (!needle) return true;
  if (haystack.includes(needle)) return true;
  try {
    const url = new URL(value);
    const host = sourceText(url.hostname.replace(/^www\./, ''));
    const path = sourceText(url.pathname.replace(/\/+$/, ''));
    return Boolean(host && haystack.includes(host)) || Boolean(path.length > 1 && haystack.includes(path));
  } catch {
    return false;
  }
}

function mentionsPhone(haystack: string, value: string | null): boolean {
  if (!value) return true;
  if (haystack.includes(sourceText(value))) return true;
  const digits = value.replace(/\D/g, '');
  const sourceDigits = haystack.replace(/\D/g, '');
  return digits.length >= 7 && sourceDigits.includes(digits);
}

function normalizeCandidate(value: unknown, city: string, niches: string[]): DiscoveryCandidate | null {
  if (!value || typeof value !== 'object') return null;
  const c = value as Record<string, unknown>;
  const text = (key: string) => typeof c[key] === 'string' ? c[key].trim() : '';
  const businessName = text('businessName');
  const sourceUrl = text('sourceUrl');
  const evidenceQuote = text('evidenceQuote');
  if (!businessName || businessName.length > 160 || !isSafePublicUrl(sourceUrl) || evidenceQuote.length < 8) return null;
  const rawCategory = text('category') || niches[0] || 'Local business';
  const category = CATEGORY_MAP[rawCategory.toLowerCase()] || (niches.includes(rawCategory) ? rawCategory : 'Local business');
  const website = text('website');
  const instagramUrl = text('instagramUrl');
  const facebookUrl = text('facebookUrl');
  const publicEmail = text('publicEmail');
  const publicPhone = text('publicPhone');
  if (website && !isSafePublicUrl(website)) return null;
  if (instagramUrl && !isAllowedSocialUrl(instagramUrl, 'instagram')) return null;
  if (facebookUrl && !isAllowedSocialUrl(facebookUrl, 'facebook')) return null;
  if (publicEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(publicEmail)) return null;
  if (publicPhone && !/^\+?[\d\s().-]{7,24}$/.test(publicPhone)) return null;
  const confidence = ['HIGH', 'MEDIUM', 'LOW'].includes(text('confidence'))
    ? text('confidence') as DiscoveryCandidate['confidence'] : 'MEDIUM';
  const services = Array.isArray(c.services)
    ? c.services.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 12)
    : [];
  return {
    businessName, category, city: text('city') || city, website: website || null,
    instagramUrl: instagramUrl || null, facebookUrl: facebookUrl || null,
    publicEmail: publicEmail || null, publicPhone: publicPhone || null, services,
    sourceUrl, sourceTitle: text('sourceTitle') || new URL(sourceUrl).hostname,
    evidenceQuote, apparentSize: text('apparentSize') || 'UNKNOWN',
    socialActivity: text('socialActivity') || 'UNKNOWN',
    websiteOpportunity: text('websiteOpportunity') || 'REQUIRES_REVIEW', confidence,
  };
}

export class PublicDiscoveryService {
  /**
   * Discovers candidates through Gemini Google Search grounding. A grounding
   * result is not trusted by itself: source membership and a real public page
   * containing the business name are both required before storage.
   */
  static async discover(options: { city: string; niches: string[]; limit: number }): Promise<PublicDiscoveryResult> {
    const city = options.city.trim();
    const niches = options.niches.map((n) => n.trim()).filter(Boolean);
    if (!city || niches.length === 0) throw new Error('City and niches are required for public discovery.');
    const ai = getGeminiClient();
    if (!ai) throw new Error('Gemini API key is not configured.');

    const limit = Math.max(1, Math.min(options.limit, 5));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    let parsed: { candidates?: unknown[] } | null = null;
    const sources = new Set<string>();
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Find ${limit * 3} distinct local businesses in ${city} within these categories: ${niches.join(', ')}. Prioritize businesses whose public website is missing, unreachable, very slow, lacks a mobile viewport, lacks contact or booking flows, or has weak branding. Do not include private people, private social data, chains without a local presence, or irrelevant businesses. For each candidate return JSON fields: businessName, category, city, website or null, instagramUrl or null, facebookUrl or null, publicEmail or null, publicPhone or null, services, sourceUrl, sourceTitle, evidenceQuote (short quote copied from the public source), apparentSize, socialActivity, websiteOpportunity, confidence.`,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 8_192,
          tools: [{ googleSearch: {} }],
          abortSignal: controller.signal,
        },
      });
      const text = (response.text || '{}').replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
      parsed = JSON.parse(text || '{}');
      for (const chunk of response.candidates?.[0]?.groundingMetadata?.groundingChunks || []) {
        if (chunk.web?.uri) sources.add(chunk.web.uri);
      }
    } finally {
      clearTimeout(timer);
    }

    const rawCount = parsed?.candidates?.length || 0;
    const warnings: string[] = [];
    const sourceKeys = new Set([...sources].map(sourceKey));
    // Grounding membership is enforced whenever Gemini returns sources. When it
    // returns none (e.g. grounding metadata omitted), the live page checks below
    // are still mandatory before anything is stored.
    const requireGroundingMembership = sourceKeys.size > 0;
    if (!requireGroundingMembership && rawCount > 0) {
      warnings.push('Gemini returned no grounding sources; candidates were verified against live public pages only.');
    }
    const candidates = (parsed?.candidates || [])
      .map((item) => normalizeCandidate(item, city, niches))
      .filter((candidate): candidate is DiscoveryCandidate => Boolean(candidate))
      .filter((candidate) => !requireGroundingMembership || sourceKeys.has(sourceKey(candidate.sourceUrl)))
      .slice(0, limit);
    let created = 0;
    let skipped = Math.max(0, rawCount - candidates.length);

    for (const candidate of candidates) {
      try {
        const parsedSource = parseUrlInput(candidate.sourceUrl);
        if (!parsedSource.ok) { skipped++; continue; }
        const page = await safeFetch(parsedSource.url.toString(), { method: 'GET', timeoutMs: 8_000 });
        const haystack = sourceText(page.body || '');
        const evidenceText = sourceText(candidate.evidenceQuote);
        if (page.error || !evidenceText || haystack.indexOf(evidenceText) < 0) {
          skipped++;
          warnings.push('Candidate discarded because the cited quote was not present in a readable public page.');
          continue;
        }
        if (haystack.indexOf(sourceText(candidate.businessName)) < 0) {
          skipped++;
          warnings.push('Candidate discarded because the cited public page did not contain the business name.');
          continue;
        }
        const combinedSource = `${haystack} ${sourceText(candidate.sourceTitle)}`;
        // Optional fields are stored only when the fetched public page actually
        // contains them. This prevents model-suggested data from becoming lead data.
        const verifiedWebsite = candidate.website && mentionsSource(combinedSource, candidate.website) ? candidate.website : null;
        const verifiedInstagram = candidate.instagramUrl && mentionsSource(combinedSource, candidate.instagramUrl) ? candidate.instagramUrl : null;
        const verifiedFacebook = candidate.facebookUrl && mentionsSource(combinedSource, candidate.facebookUrl) ? candidate.facebookUrl : null;
        const verifiedEmail = candidate.publicEmail && mentionsSource(combinedSource, candidate.publicEmail) ? candidate.publicEmail : null;
        const verifiedPhone = candidate.publicPhone && mentionsPhone(combinedSource, candidate.publicPhone) ? candidate.publicPhone : null;
        const verifiedCity = mentionsSource(combinedSource, candidate.city) ? candidate.city : 'UNKNOWN';
        const verifiedCategory = mentionsSource(combinedSource, candidate.category) ? candidate.category : 'UNKNOWN';
        const instagramUsername = verifiedInstagram
          ? new URL(verifiedInstagram).pathname.split('/').filter(Boolean)[0] || null
          : null;
        const duplicate = await prisma.lead.findFirst({
          where: {
            OR: [
              ...(instagramUsername ? [{ instagramUsername }] : []),
              {
                source: 'PUBLIC_DISCOVERY',
                publicDiscoverySource: candidate.sourceUrl,
                businessName: candidate.businessName,
              },
            ],
          },
          select: { id: true },
        });
        if (duplicate) {
          skipped++;
          continue;
        }

        const lead = await prisma.lead.create({
          data: {
            businessName: candidate.businessName,
            personName: 'UNKNOWN',
            instagramUsername,
            phone: verifiedPhone,
            email: verifiedEmail,
            location: verifiedCity,
            website: verifiedWebsite || 'UNKNOWN',
            niche: verifiedCategory,
            source: 'PUBLIC_DISCOVERY',
            publicDiscoverySource: candidate.sourceUrl,
            facebookPageUrl: verifiedFacebook,
            status: 'NEW',
            qualification: 'PENDING_INFO',
            suggestedNextAction: 'Human review required before any outreach. Verify the public source, then run AI research.',
            confidence: candidate.confidence,
            evidence: JSON.stringify([{
              claim: 'Public discovery candidate', evidence: candidate.evidenceQuote,
              source: candidate.sourceUrl, confidence: candidate.confidence.toLowerCase(),
            }]),
          },
        });
        await prisma.evidence.create({
          data: {
            leadId: lead.id,
            claim: 'Business identity from public discovery source',
            evidence: candidate.evidenceQuote,
            source: candidate.sourceUrl,
            sourceUrl: candidate.sourceUrl,
            observation: 'Business identity and cited quote verified against the public source page.',
            fetchedAt: new Date(),
            evidenceType: 'OBSERVED_FACT',
            confidence: candidate.confidence.toLowerCase(),
          },
        });
        await prisma.agentEvent.create({
          data: {
            type: 'LEAD_DISCOVERED',
            status: 'SUCCESS',
            message: `Public discovery candidate stored: ${candidate.businessName}.`,
            leadId: lead.id,
            details: JSON.stringify({ sourceUrl: candidate.sourceUrl, category: verifiedCategory, city: verifiedCity }),
          },
        });
        created++;
      } catch (error: any) {
        skipped++;
        warnings.push(`Candidate skipped after storage error: ${error?.message || 'unknown error'}`);
      }
    }

    return { created, skipped, warnings };
  }
}

