/**
 * P8 — Safe HTTP client for public web research.
 *
 * Design rules:
 *  - Uses only Node built-ins (`node:http`, `node:https`, `node:dns`, `node:net`, `node:zlib`).
 *    No third-party HTTP dependency is added to the project.
 *  - Never throws for a URL-level problem: every failure is returned as a structured result so a
 *    single bad URL can never crash the research pipeline.
 *  - SSRF hardening: protocol allowlist, hostname blocklist, port allowlist, DNS resolution followed
 *    by private/reserved IP rejection, and the validated IP is pinned for the actual socket connect
 *    (protects against DNS rebinding / check-then-connect race). Every redirect hop is re-validated.
 *  - Timeouts, response-size caps (incl. decompression-bomb caps) and redirect limits always apply.
 */

import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';

export type HttpErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'BLOCKED_HOST'
  | 'BLOCKED_PORT'
  | 'BLOCKED_PRIVATE_ADDRESS'
  | 'DNS_FAILURE'
  | 'CONNECTION_FAILED'
  | 'TLS_ERROR'
  | 'TIMEOUT'
  | 'TOO_MANY_REDIRECTS'
  | 'HTTP_ERROR'
  | 'NETWORK_ERROR';

export interface HttpErrorInfo {
  code: HttpErrorCode;
  message: string;
}

export interface SafeHttpResponse {
  /** URL string exactly as supplied by the caller. */
  requestedUrl: string;
  /** URL actually used for the final request (after redirects). */
  finalUrl: string;
  /** true when a response was received with a non-error status that we could read. */
  ok: boolean;
  httpStatus: number | null;
  statusText: string | null;
  /** Lower-cased response headers, values joined with ", ". */
  headers: Record<string, string>;
  contentType: string | null;
  /** Decoded body for text-like responses only; null for HEAD, non-text and failed requests. */
  body: string | null;
  bodyBytes: number;
  bodyTruncated: boolean;
  redirectCount: number;
  redirectChain: string[];
  responseTimeMs: number;
  error: HttpErrorInfo | null;
}

export interface SafeFetchOptions {
  method?: 'GET' | 'HEAD';
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
  accept?: string;
  /** Ports the client is allowed to contact. Defaults to 80 and 443 only. */
  allowedPorts?: number[];
  /**
   * TEST-ONLY escape hatch. When true, loopback/private addresses are reachable so the automated
   * tests can talk to a local mock HTTP server. Automated routes MUST never populate this from
   * request data; production callers leave it undefined.
   */
  allowPrivateHostsForTests?: boolean;
}

export const DEFAULT_TIMEOUT_MS = 8000;
export const DEFAULT_MAX_BYTES = 512 * 1024;
export const DEFAULT_MAX_REDIRECTS = 3;
export const DEFAULT_ALLOWED_PORTS: number[] = [80, 443];
export const RESEARCH_USER_AGENT =
  'DWebStudioLeadAI/1.0 (human-triggered public business research)';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const BLOCKED_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.home\.arpa$/i,
  /^metadata$/i,
  /^metadata\.google\.internal$/i,
  /^instance-data$/i,
  /^0\.0\.0\.0$/,
  /^\[::\]$/,
  /^\[::1\]$/,
  /^::$/,
  /^::1$/,
];

export function stripIpv6Brackets(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = stripIpv6Brackets(hostname).toLowerCase().trim();
  if (!host) return true;
  return BLOCKED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(host));
}


/** Rejects loopback, private, link-local, CGNAT, multicast and reserved address ranges. */
export function isPrivateOrReservedAddress(address: string): boolean {
  const value = String(address || '').trim();
  const version = net.isIP(value);

  if (version === 4) {
    const parts = value.split('.').map((p) => Number(p));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b, c] = parts;
    if (a === 0) return true; // 0.0.0.0/8 "this network"
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
    if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
    if (a >= 224) return true; // multicast, reserved, broadcast
    return false;
  }

  if (version === 6) {
    const lower = value.toLowerCase().split('%')[0];
    if (lower === '::' || lower === '::1') return true;
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
    if (mapped) return isPrivateOrReservedAddress(mapped[1]);
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // fc00::/7 unique local
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // fe80::/10 link-local
    if (/^ff[0-9a-f]{2}:/.test(lower)) return true; // ff00::/8 multicast
    if (lower.startsWith('2001:db8')) return true; // documentation
    if (lower.startsWith('64:ff9b')) return true; // NAT64
    if (lower.startsWith('2002:')) return true; // 6to4
    return false;
  }

  // Not an IP literal at all -> unsafe.
  return true;
}

export function parseUrlInput(raw: unknown): { ok: true; url: URL } | { ok: false; error: HttpErrorInfo } {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, error: { code: 'INVALID_URL', message: 'No URL was provided.' } };
  }

  const trimmed = raw.trim();
  if (trimmed.length > 2048) {
    return { ok: false, error: { code: 'INVALID_URL', message: 'URL is longer than the 2048 character limit.' } };
  }

  // Accept bare domains such as "example.com" and default them to https.
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: { code: 'INVALID_URL', message: `"${trimmed}" is not a valid absolute URL.` } };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_PROTOCOL',
        message: `Protocol "${parsed.protocol}" is not allowed. Only http:// and https:// are supported.`,
      },
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      error: { code: 'INVALID_URL', message: 'URLs containing embedded credentials are rejected.' },
    };
  }

  if (!parsed.hostname) {
    return { ok: false, error: { code: 'INVALID_URL', message: 'URL is missing a hostname.' } };
  }

  return { ok: true, url: parsed };
}

export function resolvePort(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

/** Synchronous pre-flight checks: hostname blocklist and port allowlist (no DNS, no network). */
export function validateTargetSyntax(url: URL, options: SafeFetchOptions = {}): HttpErrorInfo | null {
  const port = resolvePort(url);
  const allowedPorts = options.allowedPorts && options.allowedPorts.length > 0
    ? options.allowedPorts
    : DEFAULT_ALLOWED_PORTS;

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return { code: 'BLOCKED_PORT', message: `Port ${url.port} is not a valid TCP port.` };
  }

  if (!allowedPorts.includes(port)) {
    return {
      code: 'BLOCKED_PORT',
      message: `Port ${port} is not allowed. Allowed ports: ${allowedPorts.join(', ')}.`,
    };
  }

  if (isBlockedHostname(url.hostname)) {
    return {
      code: 'BLOCKED_HOST',
      message: `Host "${url.hostname}" is blocked. localhost and internal infrastructure are never fetched.`,
    };
  }

  return null;
}

/**
 * Resolves the hostname and returns the validated addresses plus the single IP that will be pinned
 * for the socket connect. An IP literal skips DNS entirely.
 */
export async function resolveHostAddresses(
  hostname: string,
  timeoutMs: number,
): Promise<{ ok: true; addresses: string[]; pinnedAddress: string } | { ok: false; error: HttpErrorInfo }> {
  const host = stripIpv6Brackets(hostname);

  if (net.isIP(host)) {
    return { ok: true, addresses: [host], pinnedAddress: host };
  }

  let timer: NodeJS.Timeout | null = null;
  try {
    const lookupPromise = dns.promises.lookup(host, { all: true, verbatim: true });
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('DNS_TIMEOUT')), timeoutMs);
    });
    const records = await Promise.race([lookupPromise, timeoutPromise]);
    const addresses = (records as dns.LookupAddress[]).map((r) => r.address).filter(Boolean);

    if (addresses.length === 0) {
      return {
        ok: false,
        error: { code: 'DNS_FAILURE', message: `DNS lookup for "${host}" returned no addresses.` },
      };
    }

    return { ok: true, addresses, pinnedAddress: addresses[0] };
  } catch (err: any) {
    if (err?.message === 'DNS_TIMEOUT') {
      return { ok: false, error: { code: 'TIMEOUT', message: `DNS lookup for "${host}" timed out.` } };
    }
    return {
      ok: false,
      error: { code: 'DNS_FAILURE', message: `DNS lookup for "${host}" failed (${err?.code || err?.message || 'unknown error'}).` },
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function isTextLikeContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const value = contentType.toLowerCase();
  return (
    value.includes('text/') ||
    value.includes('application/xhtml+xml') ||
    value.includes('application/xml') ||
    value.includes('application/json') ||
    value.includes('application/ld+json')
  );
}

/** Decompresses a body where possible and applies a decompression-bomb cap. */
export function decodeBody(
  buffer: Buffer,
  encoding: string | null,
  maxBytes: number,
): { text: string; bytes: number; truncated: boolean } {
  const enc = (encoding || '').toLowerCase().trim();
  const guard = Math.max(maxBytes * 4, 1024 * 1024);
  let decoded: Buffer = buffer;

  try {
    if (enc === 'gzip' || enc === 'x-gzip') {
      decoded = zlib.gunzipSync(buffer, { maxOutputLength: guard });
    } else if (enc === 'deflate') {
      decoded = zlib.inflateSync(buffer, { maxOutputLength: guard });
    } else if (enc === 'br') {
      decoded = zlib.brotliDecompressSync(buffer, { maxOutputLength: guard });
    }
  } catch {
    // Decompression failed (unknown encoding or bomb guard tripped): keep the raw bytes.
    decoded = buffer;
  }

  const truncated = decoded.length > maxBytes;
  const limited = truncated ? decoded.subarray(0, maxBytes) : decoded;
  return { text: limited.toString('utf8'), bytes: decoded.length, truncated };
}

export function mapRequestError(err: any, timedOut: boolean): HttpErrorInfo {
  if (timedOut) {
    return { code: 'TIMEOUT', message: 'Request timed out before the site responded.' };
  }

  const code = String(err?.code || '');
  const tlsCodes = [
    'CERT_HAS_EXPIRED',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'ERR_SSL_WRONG_VERSION_NUMBER',
    'ERR_SSL_PACKET_LENGTH_TOO_LONG',
    'EPROTO',
  ];
  const dnsCodes = ['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'ESERVFAIL'];
  const connCodes = ['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'ETIMEDOUT'];

  if (tlsCodes.includes(code)) {
    return { code: 'TLS_ERROR', message: `TLS/HTTPS connection failed (${code}).` };
  }
  if (dnsCodes.includes(code)) {
    return { code: 'DNS_FAILURE', message: `Host could not be resolved (${code}).` };
  }
  if (connCodes.includes(code)) {
    return { code: 'CONNECTION_FAILED', message: `Connection failed (${code}).` };
  }
  return { code: 'NETWORK_ERROR', message: `Request failed (${err?.message || 'unknown error'}).` };
}

function normalizeHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

interface SingleRequestOptions extends SafeFetchOptions {
  timeoutMs: number;
  maxBytes: number;
  method: 'GET' | 'HEAD';
}

/** Performs one HTTP(S) request against a pinned, already validated IP address. */
function singleRequest(
  target: URL,
  pinnedAddress: string,
  options: SingleRequestOptions,
  requestedUrl: string,
  startedAt: number,
): Promise<{ response: SafeHttpResponse; redirectLocation: string | null }> {
  const transport = target.protocol === 'https:' ? https : http;
  const port = resolvePort(target);
  const hostname = stripIpv6Brackets(target.hostname);
  const isIpLiteral = net.isIP(hostname) !== 0;

  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let capReached = false;
    const chunks: Buffer[] = [];
    let receivedBytes = 0;

    const makeResponse = (overrides: Partial<SafeHttpResponse> & { error: HttpErrorInfo | null }): SafeHttpResponse => ({
      requestedUrl,
      finalUrl: target.toString(),
      ok: false,
      httpStatus: null,
      statusText: null,
      headers: {},
      contentType: null,
      body: null,
      bodyBytes: 0,
      bodyTruncated: false,
      redirectCount: 0,
      redirectChain: [],
      responseTimeMs: Date.now() - startedAt,
      ...overrides,
    });

    const finish = (response: SafeHttpResponse, redirectLocation: string | null = null) => {
      if (settled) return;
      settled = true;
      resolve({ response, redirectLocation });
    };

    const buildFromResponse = (res: http.IncomingMessage, truncated: boolean): SafeHttpResponse => {
      const headers = normalizeHeaders(res.headers);
      const contentType = headers['content-type'] || null;
      const code = res.statusCode ?? null;
      const ok = code !== null && code >= 200 && code < 400;
      const decoded = chunks.length > 0
        ? decodeBody(Buffer.concat(chunks), headers['content-encoding'] || null, options.maxBytes)
        : { text: '', bytes: 0, truncated: false };

      return makeResponse({
        ok,
        httpStatus: code,
        statusText: res.statusMessage || null,
        headers,
        contentType,
        body: decoded.text || null,
        bodyBytes: decoded.bytes,
        bodyTruncated: truncated || decoded.truncated,
        error: ok ? null : { code: 'HTTP_ERROR', message: `HTTP ${code ?? '?'} ${res.statusMessage || ''}`.trim() },
      });
    };

    let request: http.ClientRequest;
    try {
      request = transport.request(
        {
          hostname,
          port,
          path: `${target.pathname}${target.search}`,
          method: options.method,
          headers: {
            'User-Agent': options.userAgent || RESEARCH_USER_AGENT,
            Accept: options.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'en-US,en;q=0.9',
            Connection: 'close',
          },
          // Pin the connect step to the IP that was validated above (anti DNS-rebinding).
          lookup: (_host: string, lookupOptions: any, callback: any) => {
            const family = net.isIP(pinnedAddress) === 6 ? 6 : 4;
            if (lookupOptions && lookupOptions.all) {
              callback(null, [{ address: pinnedAddress, family }]);
            } else {
              callback(null, pinnedAddress, family);
            }
          },
          ...(target.protocol === 'https:' && !isIpLiteral ? { servername: hostname } : {}),
        } as any,
        (res) => {
          const headers = normalizeHeaders(res.headers);
          const code = res.statusCode ?? 0;
          const location = headers['location'];
          if (REDIRECT_STATUSES.has(code) && location) {
            res.resume();
            finish(
              makeResponse({
                httpStatus: code,
                statusText: res.statusMessage || null,
                headers,
                contentType: headers['content-type'] || null,
                error: null,
              }),
              location,
            );
            return;
          }

          const contentType = headers['content-type'] || null;
          if (options.method === 'HEAD' || !isTextLikeContentType(contentType)) {
            res.resume();
            const okStatus = code >= 200 && code < 400;
            finish(makeResponse({
              ok: okStatus,
              httpStatus: code,
              statusText: res.statusMessage || null,
              headers,
              contentType,
              error: okStatus ? null : { code: 'HTTP_ERROR', message: `HTTP ${code} ${res.statusMessage || ''}`.trim() },
            }));
            return;
          }

          res.on('data', (chunk: Buffer) => {
            if (settled || capReached) return;
            chunks.push(chunk);
            receivedBytes += chunk.length;
            if (receivedBytes > options.maxBytes) {
              capReached = true;
              request.destroy();
              finish(buildFromResponse(res, true));
            }
          });
          res.on('end', () => finish(buildFromResponse(res, false)));
          res.on('error', (err) => finish(makeResponse({ error: mapRequestError(err, timedOut) })));
        },
      );
    } catch (err: any) {
      finish(makeResponse({ error: mapRequestError(err, false) }));
      return;
    }

    request.setTimeout(options.timeoutMs, () => {
      timedOut = true;
      request.destroy();
    });
    request.on('error', (err) => finish(makeResponse({ error: mapRequestError(err, timedOut) })));
    request.end();
  });
}

function blockedResponse(
  requestedUrl: string,
  error: HttpErrorInfo,
  chain: string[],
  redirectCount: number,
  startedAt: number,
): SafeHttpResponse {
  return {
    requestedUrl,
    finalUrl: chain.length > 0 ? chain[chain.length - 1] : requestedUrl,
    ok: false,
    httpStatus: null,
    statusText: null,
    headers: {},
    contentType: null,
    body: null,
    bodyBytes: 0,
    bodyTruncated: false,
    redirectCount,
    redirectChain: chain,
    responseTimeMs: Date.now() - startedAt,
    error,
  };
}

/**
 * Fetches a public URL with a bounded, SSRF-hardened pipeline.
 * Never throws: URL, DNS, TLS, timeout, HTTP and size problems are all reported structurally.
 */
export async function safeFetch(urlInput: string, options: SafeFetchOptions = {}): Promise<SafeHttpResponse> {
  const requestedUrl = typeof urlInput === 'string' ? urlInput : String(urlInput ?? '');
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes && options.maxBytes > 0 ? options.maxBytes : DEFAULT_MAX_BYTES;
  const maxRedirects = typeof options.maxRedirects === 'number' && options.maxRedirects >= 0
    ? options.maxRedirects
    : DEFAULT_MAX_REDIRECTS;
  const method = options.method || 'GET';

  const parsed = parseUrlInput(urlInput);
  if (!parsed.ok) {
    return blockedResponse(requestedUrl, parsed.error, [], 0, startedAt);
  }

  let current = parsed.url;
  const chain: string[] = [current.toString()];
  let redirectCount = 0;

  for (;;) {
    const syntaxError = validateTargetSyntax(current, options);
    if (syntaxError) {
      return blockedResponse(requestedUrl, syntaxError, chain, redirectCount, startedAt);
    }

    const resolved = await resolveHostAddresses(current.hostname, timeoutMs);
    if (!resolved.ok) {
      return blockedResponse(requestedUrl, resolved.error, chain, redirectCount, startedAt);
    }

    if (!options.allowPrivateHostsForTests) {
      const privateAddress = resolved.addresses.find((address) => isPrivateOrReservedAddress(address));
      if (privateAddress) {
        return blockedResponse(
          requestedUrl,
          {
            code: 'BLOCKED_PRIVATE_ADDRESS',
            message: `Host "${current.hostname}" resolves to a private or reserved address (${privateAddress}) and is not fetched.`,
          },
          chain,
          redirectCount,
          startedAt,
        );
      }
    }

    const { response, redirectLocation } = await singleRequest(
      current,
      resolved.pinnedAddress,
      { ...options, timeoutMs, maxBytes, method },
      requestedUrl,
      startedAt,
    );

    if (!redirectLocation) {
      return { ...response, redirectChain: chain, redirectCount };
    }

    if (redirectCount >= maxRedirects) {
      return {
        ...response,
        error: {
          code: 'TOO_MANY_REDIRECTS',
          message: `Stopped after ${maxRedirects} redirects.`,
        },
        redirectChain: chain,
        redirectCount,
      };
    }

    let resolvedRedirect: URL;
    try {
      resolvedRedirect = new URL(redirectLocation, current);
    } catch {
      return {
        ...response,
        error: { code: 'INVALID_URL', message: `Redirect target "${redirectLocation}" could not be parsed.` },
        redirectChain: chain,
        redirectCount,
      };
    }

    // Every redirect hop is re-validated (protocol, host, port allowlist, DNS, private ranges).
    if (resolvedRedirect.protocol !== 'http:' && resolvedRedirect.protocol !== 'https:') {
      return {
        ...response,
        error: {
          code: 'UNSUPPORTED_PROTOCOL',
          message: `Redirect to protocol "${resolvedRedirect.protocol}" is not allowed.`,
        },
        redirectChain: chain,
        redirectCount,
      };
    }

    redirectCount += 1;
    current = resolvedRedirect;
    chain.push(current.toString());
  }
}

/** Convenience wrapper: fetch text input / robots.txt style resources. */
export async function safeFetchText(
  urlInput: string,
  options: SafeFetchOptions = {},
): Promise<SafeHttpResponse> {
  return safeFetch(urlInput, { ...options, method: 'GET' });
}

