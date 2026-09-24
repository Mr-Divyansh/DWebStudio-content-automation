import http from 'node:http';
import { AddressInfo, Socket } from 'node:net';
import { prisma } from '../server/src/database/client.js';
import { LeadRepository } from '../server/src/database/repositories/leadRepository.js';
import { parseUrlInput, safeFetch } from '../server/src/services/httpClient.js';
import { WebsiteAuditor } from '../server/src/services/websiteAudit.js';
import { ResearchService } from '../server/src/services/researchService.js';
import { verifyQuotedResearchProfile } from '../server/src/ai/analyzer.js';

type Result = { name: string; passed: boolean; message?: string };

/**
 * Phase 1 (P1/P2/P8) tests.
 *
 * Everything network-related here runs against a LOCAL mock HTTP server on 127.0.0.1 with synthetic
 * fixture pages. No real website is ever contacted, and no private Instagram content is used: the
 * fixture lead is created only for these tests and deleted afterwards.
 */

const HEALTHY_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Alpha Dental Clinic</title>
  <meta name="description" content="Family dental care in Springfield. Book your appointment online." />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="canonical" href="/" />
  <meta property="og:site_name" content="Alpha Dental Clinic" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Dentist",
    "name": "Alpha Dental Clinic",
    "telephone": "+1-555-0100",
    "email": "hello@alpha-dental-mock.test",
    "address": { "streetAddress": "10 Mock Street", "addressLocality": "Springfield", "addressRegion": "IL", "addressCountry": "US" },
    "makesOffer": [ { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Teeth Whitening" } } ]
  }
  </script>
</head>
<body>
  <h1>Alpha Dental Clinic</h1>
  <p>We provide family dental care and cosmetic treatments in Springfield.</p>
  <img src="/hero.png" />
  <a href="https://calendly.com/alpha-dental-mock/consult">Book an appointment</a>
  <a href="/contact">Contact us</a>
  <a href="mailto:hello@alpha-dental-mock.test">Email us</a>
  <a href="tel:+15550100">Call us</a>
  <a href="https://www.instagram.com/alpha_dental_mock">Instagram</a>
  <a href="https://www.facebook.com/alpha_dental_mock">Facebook</a>
  <script>window.analytics = "this script text must never reach the AI extract";</script>
</body>
</html>`;

const THIN_PAGE = `<!DOCTYPE html><html><head></head><body><p>Coming soon</p></body></html>`;

const MALFORMED_PAGE = `<html><head><title>Broken Page</title></head><body><h1>Unclosed <p>text<img src=x>`;

const BIG_PAGE = `<!DOCTYPE html><html><head><title>Large Mock Page</title></head><body><h1>Large</h1><p>${'lorem ipsum '.repeat(4000)}</p></body></html>`;

interface MockServer {
  port: number;
  base: string;
  close: () => Promise<void>;
}

async function startMockServer(): Promise<MockServer> {
  const sockets = new Set<Socket>();

  const server = http.createServer((req, res) => {
    const path = req.url || '/';

    if (path.startsWith('/robots.txt')) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('User-agent: *\nAllow: /\n');
      return;
    }
    if (path.startsWith('/redirect')) {
      res.writeHead(302, { Location: '/final' });
      res.end();
      return;
    }
    if (path.startsWith('/loop')) {
      res.writeHead(302, { Location: '/loop' });
      res.end();
      return;
    }
    if (path.startsWith('/final')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><head><title>Redirected Landing Page</title></head><body><h1>Final</h1></body></html>');
      return;
    }
    if (path.startsWith('/error')) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><body>Server error</body></html>');
      return;
    }
    if (path.startsWith('/slow')) {
      // Intentionally never responds: used for the timeout test.
      return;
    }
    if (path.startsWith('/big')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(BIG_PAGE);
      return;
    }
    if (path.startsWith('/thin')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(THIN_PAGE);
      return;
    }
    if (path.startsWith('/malformed')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(MALFORMED_PAGE);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HEALTHY_PAGE);
  });

  // The https probe in this suite hits this plain-HTTP server, so TLS handshake garbage must not
  // crash it.
  server.on('clientError', (_err, socket) => {
    try {
      socket.destroy();
    } catch {
      // ignored
    }
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  return {
    port,
    base: `http://127.0.0.1:${port}`,
    close: async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export async function runResearchTests(): Promise<Result[]> {
  const results: Result[] = [];
  const mock = await startMockServer();
  const localOptions = { allowedPorts: [mock.port], allowPrivateHostsForTests: true };
  const auditOptions = { fetchOptions: localOptions };
  const publicEvidence = [mock.base, `${mock.base}/`];

  const check = async (
    name: string,
    run: () => Promise<{ passed: boolean; message?: string }>,
  ) => {
    try {
      const outcome = await run();
      results.push({ name, passed: outcome.passed, message: outcome.message });
    } catch (err: any) {
      results.push({ name, passed: false, message: `unexpected exception: ${err?.message}` });
    }
  };

  // ---------- P8: safe HTTP client ----------

  await check('P8 Safe fetch: valid URL returns a structured response (200, body, timing)', async () => {
    const response = await safeFetch(`${mock.base}/`, localOptions);
    return {
      passed:
        response.ok === true &&
        response.httpStatus === 200 &&
        (response.body || '').includes('Alpha Dental Clinic') &&
        response.error === null &&
        response.responseTimeMs >= 0,
      message: `status=${response.httpStatus}, bodyBytes=${response.bodyBytes}, ${response.responseTimeMs}ms`,
    };
  });

  await check('P8 Safe fetch: malformed / empty URLs are rejected with INVALID_URL (no throw)', async () => {
    const inputs = ['', '   ', 'not a url', 'https://', 'http://exa mple.com'];
    const outcomes = inputs.map((input) => parseUrlInput(input));
    const allRejected = outcomes.every((outcome) => outcome.ok === false);
    const fetchOutcome = await safeFetch('not a url', localOptions);
    return {
      passed: allRejected && fetchOutcome.ok === false && fetchOutcome.error?.code === 'INVALID_URL',
      message: `rejected=${outcomes.length}/${inputs.length}, code=${fetchOutcome.error?.code}`,
    };
  });

  await check('P8 Safe fetch: unsupported protocols (file:, ftp:, javascript:) are blocked', async () => {
    const fileUrl = await safeFetch('file:///C:/Windows/win.ini', localOptions);
    const ftpUrl = await safeFetch('ftp://example.com/file.txt', localOptions);
    const jsUrl = await safeFetch('javascript:alert(1)', localOptions);
    return {
      passed:
        fileUrl.error?.code === 'UNSUPPORTED_PROTOCOL' &&
        ftpUrl.error?.code === 'UNSUPPORTED_PROTOCOL' &&
        jsUrl.error?.code === 'UNSUPPORTED_PROTOCOL',
      message: `${fileUrl.error?.code} / ${ftpUrl.error?.code} / ${jsUrl.error?.code}`,
    };
  });

  await check('P8 SSRF: localhost, loopback, private ranges and cloud metadata are blocked by default', async () => {
    const targets: Array<[string, string]> = [
      ['http://localhost/', 'BLOCKED_HOST'],
      ['http://127.0.0.1/', 'BLOCKED_PRIVATE_ADDRESS'],
      ['http://10.0.0.1/', 'BLOCKED_PRIVATE_ADDRESS'],
      ['http://172.16.5.5/', 'BLOCKED_PRIVATE_ADDRESS'],
      ['http://192.168.1.10/', 'BLOCKED_PRIVATE_ADDRESS'],
      ['http://169.254.169.254/latest/meta-data/', 'BLOCKED_PRIVATE_ADDRESS'],
      ['http://[::1]/', 'BLOCKED_HOST'],
    ];

    const codes: string[] = [];
    let allBlocked = true;
    for (const [target, expected] of targets) {
      const response = await safeFetch(target, {});
      codes.push(`${target}=${response.error?.code}`);
      if (response.error?.code !== expected || response.httpStatus !== null) allBlocked = false;
    }

    return { passed: allBlocked, message: codes.join(', ') };
  });

  await check('P8 SSRF: non-web ports are refused before any connection attempt', async () => {
    const redisPort = await safeFetch('http://example.com:6379/', {});
    const internalApi = await safeFetch('https://example.com:9200/', {});
    return {
      passed: redisPort.error?.code === 'BLOCKED_PORT' && internalApi.error?.code === 'BLOCKED_PORT',
      message: `${redisPort.error?.code} / ${internalApi.error?.code}`,
    };
  });

  await check('P8 Safe fetch: a hanging server produces a TIMEOUT result instead of crashing', async () => {
    const response = await safeFetch(`${mock.base}/slow`, { ...localOptions, timeoutMs: 400 });
    return {
      passed: response.ok === false && response.error?.code === 'TIMEOUT' && response.responseTimeMs >= 300,
      message: `code=${response.error?.code}, ${response.responseTimeMs}ms`,
    };
  });

  await check('P8 Safe fetch: HTTP 500 is reported with status + HTTP_ERROR and never throws', async () => {
    const response = await safeFetch(`${mock.base}/error`, localOptions);
    return {
      passed:
        response.ok === false &&
        response.httpStatus === 500 &&
        response.error?.code === 'HTTP_ERROR' &&
        (response.body || '').includes('Server error'),
      message: `status=${response.httpStatus}, code=${response.error?.code}`,
    };
  });

  await check('P8 Safe fetch: 302 redirects are followed and re-validated', async () => {
    const response = await safeFetch(`${mock.base}/redirect`, localOptions);
    return {
      passed:
        response.ok === true &&
        response.redirectCount === 1 &&
        response.finalUrl.endsWith('/final') &&
        response.redirectChain.length === 2 &&
        (response.body || '').includes('Redirected Landing Page'),
      message: `final=${response.finalUrl}, chain=${response.redirectChain.join(' -> ')}`,
    };
  });

  await check('P8 Safe fetch: redirect loops stop with TOO_MANY_REDIRECTS (bounded hops)', async () => {
    const response = await safeFetch(`${mock.base}/loop`, { ...localOptions, maxRedirects: 2 });
    return {
      passed: response.error?.code === 'TOO_MANY_REDIRECTS' && response.redirectCount === 2,
      message: `code=${response.error?.code}, redirects=${response.redirectCount}`,
    };
  });

  // ---------- P2: deterministic website audit ----------

  await check('P2 Audit: healthy page yields deterministic facts + traced evidence', async () => {
    const audit = await WebsiteAuditor.audit(`${mock.base}/`, auditOptions);
    const observations = audit.observations.map((item) => item.observation);
    const allTraced = audit.observations.every(
      (item) => Boolean(item.sourceUrl) && Boolean(item.fetchedAt) && Boolean(item.evidenceType) && item.claim.length > 0,
    );

    return {
      passed:
        audit.reachable === true &&
        audit.httpStatus === 200 &&
        audit.htmlAnalyzed === true &&
        audit.title === 'Alpha Dental Clinic' &&
        audit.viewportMetaPresent === true &&
        audit.bookingLinkDetected === true &&
        audit.contactLinkDetected === true &&
        audit.robotsTxtPresent === true &&
        audit.httpsAvailable === false &&
        observations.includes('Homepage response: 200') &&
        observations.includes('HTTPS: no') &&
        observations.includes('Booking link detected: yes (https://calendly.com/alpha-dental-mock/consult)') &&
        observations.includes('Viewport meta tag: present (width=device-width, initial-scale=1)') &&
        allTraced,
      message: `observations=${observations.length}, title="${audit.title}", booking=${audit.bookingLinkDetected}, evidenceTraced=${allTraced}`,
    };
  });

  await check('P2 Audit: missing metadata/booking/contact are reported as absences (never guessed)', async () => {
    const audit = await WebsiteAuditor.audit(`${mock.base}/thin`, auditOptions);
    const observations = audit.observations.map((item) => item.observation);

    return {
      passed:
        audit.reachable === true &&
        audit.title === null &&
        audit.metaDescription === null &&
        audit.viewportMetaPresent === false &&
        audit.canonicalUrl === null &&
        audit.h1Count === 0 &&
        audit.bookingLinkDetected === false &&
        audit.contactLinkDetected === false &&
        audit.emailFromPage === null &&
        audit.phoneFromPage === null &&
        audit.servicesFromStructuredData === null &&
        observations.includes('Title tag: missing') &&
        observations.includes('Meta description: missing') &&
        observations.includes('Viewport meta tag: missing') &&
        observations.includes('Booking link detected: no') &&
        observations.includes('Contact link detected: no') &&
        audit.observations.some((item) => item.claim === 'Booking link' && item.evidenceType === 'OBSERVED_ABSENCE'),
      message: `h1=${audit.h1Count}, booking=${audit.bookingLinkDetected}, meta=${audit.metaDescription}`,
    };
  });

  await check('P2 Audit: malformed HTML is parsed defensively without crashing', async () => {
    const audit = await WebsiteAuditor.audit(`${mock.base}/malformed`, auditOptions);
    return {
      passed:
        audit.reachable === true &&
        audit.htmlAnalyzed === true &&
        audit.title === 'Broken Page' &&
        audit.errors.every((error) => error.code !== 'HTML_PARSE_ERROR'),
      message: `title="${audit.title}", htmlAnalyzed=${audit.htmlAnalyzed}, errors=${audit.errors.length}`,
    };
  });

  await check('P2 Audit: oversized responses are capped and the limitation is reported', async () => {
    const audit = await WebsiteAuditor.audit(`${mock.base}/big`, { fetchOptions: localOptions, maxBytes: 20000 });
    return {
      passed:
        audit.reachable === true &&
        audit.title === 'Large Mock Page' &&
        audit.warnings.some((warning) => warning.toLowerCase().includes('truncated')),
      message: `warnings=${audit.warnings.length}`,
    };
  });

  await check('P2 Audit: blocked/invalid targets return structured failures (no exception)', async () => {
    const blocked = await WebsiteAuditor.audit('http://127.0.0.1/', {});
    const invalid = await WebsiteAuditor.audit('not a url', {});

    return {
      passed:
        blocked.reachable === false &&
        blocked.errors[0]?.code === 'BLOCKED_PRIVATE_ADDRESS' &&
        blocked.observations[0]?.evidenceType === 'UNREACHABLE' &&
        invalid.reachable === false &&
        invalid.observations[0]?.evidenceType === 'NOT_EVALUATED',
      message: `blocked=${blocked.errors[0]?.code}, invalid=${invalid.errors[0]?.code}`,
    };
  });

  // ---------- P1: business research + evidence ----------

  let testLeadId = '';
  let evidenceCountAfterFirstRun = 0;

  await check('P1 Research: a lead without any URL returns NO_URL and stores nothing', async () => {
    const lead = await LeadRepository.create({
      businessName: 'Synthetic Research Target',
      personName: 'Synthetic Owner',
      instagramUsername: `research_mock_${Date.now()}`,
      website: 'UNKNOWN',
      source: 'INSTAGRAM',
      sourceConversationId: `research_mock_convo_${Date.now()}`,
      status: 'NEW',
    });
    testLeadId = lead.id;

    const outcome = await ResearchService.researchLead(lead.id, { useAi: false });
    const rows = await prisma.businessResearch.count({ where: { leadId: lead.id } });

    return {
      passed: outcome.status === 'NO_URL' && outcome.targetUrl === null && rows === 0 && outcome.warnings.length > 0,
      message: `status=${outcome.status}, rows=${rows}`,
    };
  });

  await check('P1 Research: invalid URLs are rejected without crashing the pipeline', async () => {
    const outcome = await ResearchService.researchLead(testLeadId, { url: 'ftp://example.com/file', useAi: false });
    return {
      passed:
        outcome.status === 'URL_REJECTED' &&
        outcome.errors[0]?.code === 'UNSUPPORTED_PROTOCOL' &&
        outcome.research === null,
      message: `status=${outcome.status}, code=${outcome.errors[0]?.code}`,
    };
  });

  await check('P1 Research: localhost/private targets stay blocked through the whole pipeline', async () => {
    const outcome = await ResearchService.researchLead(testLeadId, { url: 'http://127.0.0.1/', useAi: false });
    const stored = await prisma.businessResearch.findMany({ where: { leadId: testLeadId } });

    return {
      passed:
        outcome.status === 'FAILED' &&
        outcome.errors[0]?.code === 'BLOCKED_PRIVATE_ADDRESS' &&
        stored.length === 1 &&
        stored[0].reachable === false &&
        stored[0].status === 'FAILED',
      message: `status=${outcome.status}, code=${outcome.errors[0]?.code}, stored=${stored.length}`,
    };
  });

  await check('P1 Research: public facts are stored and every evidence row carries sourceUrl + fetchedAt + evidenceType', async () => {
    const outcome = await ResearchService.researchLead(testLeadId, {
      url: `${mock.base}/`,
      useAi: false,
      fetchOptions: localOptions,
    });
    const storedEvidence = await prisma.evidence.findMany({
      where: { leadId: testLeadId, sourceUrl: { in: publicEvidence } },
    });
    evidenceCountAfterFirstRun = storedEvidence.length;
    const research = outcome.research;

    return {
      passed:
        outcome.status === 'COMPLETED' &&
        Boolean(research) &&
        research.businessName === 'Alpha Dental Clinic' &&
        research.bookingLinkDetected === true &&
        research.contactLinkDetected === true &&
        research.httpsAvailable === false &&
        research.publicEmail === 'hello@alpha-dental-mock.test' &&
        research.businessType === null &&
        research.services !== null &&
        outcome.unknowns.includes('businessType') &&
        outcome.unknowns.includes('category') &&
        outcome.evidence.length > 5 &&
        storedEvidence.length > 5 &&
        storedEvidence.every(
          (row) =>
            row.sourceUrl !== null &&
            row.fetchedAt !== null &&
            row.evidenceType !== null &&
            row.observation !== null &&
            row.claim.length > 0,
        ),
      message: `status=${outcome.status}, evidence=${storedEvidence.length}, unknowns=${outcome.unknowns.join('/')}`,
    };
  });

  await check('P1 Research: repeating the same URL reuses stored research (no duplicates)', async () => {
    const outcome = await ResearchService.researchLead(testLeadId, {
      url: `${mock.base}/`,
      useAi: false,
      fetchOptions: localOptions,
    });
    const rows = await prisma.businessResearch.count({
      where: { leadId: testLeadId, targetUrl: `${mock.base}/` },
    });
    const evidence = await prisma.evidence.count({
      where: { leadId: testLeadId, sourceUrl: `${mock.base}/` },
    });

    return {
      passed:
        outcome.status === 'CACHED' &&
        outcome.cached === true &&
        rows === 1 &&
        evidence === evidenceCountAfterFirstRun,
      message: `status=${outcome.status}, rows=${rows}, evidence=${evidence}/${evidenceCountAfterFirstRun}`,
    };
  });

  await check('P1 Research: force refresh replaces the record without duplicating evidence', async () => {
    const outcome = await ResearchService.researchLead(testLeadId, {
      url: `${mock.base}/`,
      force: true,
      useAi: false,
      fetchOptions: localOptions,
    });
    const rows = await prisma.businessResearch.count({
      where: { leadId: testLeadId, targetUrl: `${mock.base}/` },
    });
    const evidence = await prisma.evidence.count({
      where: { leadId: testLeadId, sourceUrl: `${mock.base}/` },
    });

    return {
      passed:
        outcome.status === 'COMPLETED' &&
        outcome.cached === false &&
        rows === 1 &&
        evidence === evidenceCountAfterFirstRun,
      message: `status=${outcome.status}, rows=${rows}, evidence=${evidence} (expected ${evidenceCountAfterFirstRun})`,
    };
  });

  await check('P1 Research: an unreachable host produces FAILED + UNREACHABLE evidence (never throws)', async () => {
    const dead = await startMockServer();
    const deadPort = dead.port;
    await dead.close();

    const outcome = await ResearchService.researchLead(testLeadId, {
      url: `http://127.0.0.1:${deadPort}/`,
      useAi: false,
      fetchOptions: { allowedPorts: [deadPort], allowPrivateHostsForTests: true },
    });

    return {
      passed:
        outcome.status === 'FAILED' &&
        outcome.research?.status === 'FAILED' &&
        outcome.evidence.some((item) => item.evidenceType === 'UNREACHABLE') &&
        outcome.warnings.length >= 0,
      message: `status=${outcome.status}, errors=${outcome.errors.map((error) => error.code).join(',')}`,
    };
  });

  await check('P1 Research: stored runs are listed per lead for the API and UI', async () => {
    const stored = await ResearchService.getResearchForLead(testLeadId);
    return {
      passed: stored.length >= 2 && stored.every((row) => row.leadId === testLeadId && Boolean(row.targetUrl)),
      message: `rows=${stored.length}`,
    };
  });

  await check('P1 No-invention guard: AI values without verbatim page support are discarded', async () => {
    const extract = 'Alpha Dental Clinic offers family dental care and cosmetic treatments in Springfield.';
    const { profile, dropped } = verifyQuotedResearchProfile(
      {
        businessName: 'Alpha Dental Clinic',
        businessType: 'Dental Clinic',
        category: 'Local business',
        services: [
          { name: 'Teeth Whitening', evidenceQuote: 'family dental care and cosmetic treatments' },
          { name: 'Invisible Braces', evidenceQuote: 'we are the cheapest option in the country' },
        ],
        location: 'Springfield',
        publicEmail: null,
        publicPhone: '+1-555-0199',
        bookingFlow: 'book online',
        observations: [
          { observation: 'Offers cosmetic treatments', evidenceQuote: 'cosmetic treatments in Springfield' },
        ],
        confidence: 'HIGH',
        insufficientEvidence: false,
      },
      { pageExtract: extract, deterministicFacts: ['Title tag: present — "Alpha Dental Clinic"'] },
    );

    return {
      passed:
        profile.businessName === 'Alpha Dental Clinic' &&
        profile.businessType === 'Dental Clinic' &&
        profile.location === 'Springfield' &&
        profile.services.length === 1 &&
        profile.services[0].name === 'Teeth Whitening' &&
        profile.observations.length === 1 &&
        profile.publicPhone === null &&
        profile.bookingFlow === null &&
        dropped.length >= 2 &&
        profile.confidence === 'MEDIUM',
      message: `services=${profile.services.length}, dropped=${dropped.length} (${dropped.join(' | ')})`,
    };
  });

  await check('P1 No-invention guard: a fully unsupported profile collapses to UNKNOWN / LOW / insufficient', async () => {
    const { profile } = verifyQuotedResearchProfile(
      {
        businessName: 'Totally Invented Spa',
        businessType: 'Luxury Spa',
        category: 'Salon',
        services: [{ name: 'Gold Facial', evidenceQuote: 'the best gold facial in the world' }],
        location: 'Nowhere City',
        publicEmail: 'fake@not-on-page.test',
        publicPhone: '+1-555-9999',
        bookingFlow: 'online booking',
        observations: [{ observation: 'Very popular', evidenceQuote: 'we are the most popular salon' }],
        confidence: 'HIGH',
        insufficientEvidence: false,
      },
      { pageExtract: 'Coming soon', deterministicFacts: [] },
    );

    return {
      passed:
        profile.businessName === null &&
        profile.businessType === null &&
        profile.location === null &&
        profile.publicEmail === null &&
        profile.publicPhone === null &&
        profile.services.length === 0 &&
        profile.observations.length === 0 &&
        profile.category === 'UNKNOWN' &&
        profile.confidence === 'LOW' &&
        profile.insufficientEvidence === true,
      message: `category=${profile.category}, confidence=${profile.confidence}, insufficient=${profile.insufficientEvidence}`,
    };
  });

  // Cleanup: delete the synthetic test lead (cascades to its research + evidence rows).
  if (testLeadId) {
    try {
      await prisma.lead.delete({ where: { id: testLeadId } });
    } catch {
      // ignored
    }
  }
  await mock.close();

  return results;
}
