/**
 * OFFICIAL MESSAGING ADAPTER — Tests (100% mocked, zero network access).
 *
 * Every test injects a fake `fetch`, so no real Meta API call is ever made and
 * no real message can be sent from the test suite.
 */

import {
  InstagramMessagingProvider,
  isIgScopedId,
  readInstagramConfig,
  FetchLike,
} from '../server/src/agent/providers/instagramMessagingProvider.js';
import { selectMessagingProvider } from '../server/src/agent/messagingProvider.js';

type Result = { name: string; passed: boolean; message?: string };

const VALID_TOKEN = 'EAABwzLixnjYBO7ZBtesttokenplaceholder';
const VALID_PAGE = '1234567890';
const VALID_IGSID = '17841400000000001';

const BASE_CONFIG = {
  pageAccessToken: VALID_TOKEN,
  pageId: VALID_PAGE,
  apiVersion: 'v21.0',
  maxRetries: 0,
  maxTextBytes: 1000,
};

function jsonResponse(status: number, body: any, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Builds a fake fetch from a queue of responses, recording every call. */
function mockFetch(responses: Array<() => Response>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('mock fetch called more times than expected');
    return next();
  };
  return { impl, calls };
}

function authorizedProvider(
  responses: Array<() => Response>,
  config: Partial<typeof BASE_CONFIG> = {},
  fetchImpl?: FetchLike,
) {
  // Webhook config is passed explicitly so the token/page credentials under
  // test are never shadowed by a positional argument shift.
  const { impl, calls } = mockFetch(responses);
  const provider = new InstagramMessagingProvider(
    { ...BASE_CONFIG, ...config },
    fetchImpl ?? impl,
    { verifyToken: 'test-verify-token', appSecret: 'test-app-secret' },
  );
  return { provider, calls };
}

export async function runMessagingProviderTests(): Promise<Result[]> {
  const results: Result[] = [];
  const pass = (name: string, passed: boolean, message?: string) => results.push({ name, passed, message });

  try {
    /* 1. IGSID validation rejects handles ------------------------------------- */
    pass('IG: an @username is rejected as a recipient', !isIgScopedId('some_business_handle'));
    pass('IG: a numeric IGSID is accepted', isIgScopedId(VALID_IGSID));

    /* 2. Config reader pulls credentials from the environment ------------------ */
    const cfg = readInstagramConfig({
      META_PAGE_ACCESS_TOKEN: VALID_TOKEN,
      META_PAGE_ID: VALID_PAGE,
    } as any);
    pass(
      'IG: config reads the page token and id from the environment',
      cfg.pageAccessToken === VALID_TOKEN && cfg.pageId === VALID_PAGE && cfg.apiVersion === 'v26.0',
    );

    /* 3. Missing credentials => not configured, never sends -------------------- */
    const unconfigured = new InstagramMessagingProvider(
      { ...BASE_CONFIG, pageAccessToken: '', pageId: '' },
      async () => {
        throw new Error('network must not be touched');
      },
      { verifyToken: '', appSecret: '' },
    );
    pass('IG: missing credentials means isConfigured=false', unconfigured.isConfigured === false);
    const unconfiguredSend = await unconfigured.send({
      leadId: 'L1',
      channel: 'INSTAGRAM_DM',
      recipient: VALID_IGSID,
      body: 'hi',
      contentHash: 'h',
    });
    pass(
      'IG: unconfigured provider refuses to send',
      unconfiguredSend.status === 'BLOCKED' && unconfiguredSend.error === 'MESSAGE_PROVIDER_NOT_CONFIGURED',
      `status=${unconfiguredSend.status}`,
    );

    /* 4. Authorization succeeds and the token is sent as a HEADER -------------- */
    const { provider: authOk, calls: authCalls } = authorizedProvider([
      () => jsonResponse(200, { id: VALID_PAGE, name: 'Test Page', instagram_business_account: { id: VALID_IGSID } }),
    ]);
    const auth = await authOk.checkAuthorization();
    pass('IG: valid credentials report authorized=true', auth.authorized === true, auth.reason);
    const authHeader = (authCalls[0].init?.headers as Record<string, string>)?.Authorization;
    pass('IG: token is sent as an Authorization header', authHeader === `Bearer ${VALID_TOKEN}`);
    pass('IG: token is never placed in the request URL', !authCalls[0].url.includes(VALID_TOKEN), 'url carries no credential');


    /* 7. Unauthorized provider refuses to send (no network for the POST) ------- */
    const { provider: blockedProvider, calls: blockedCalls } = authorizedProvider([
      () => jsonResponse(401, { error: { message: 'Invalid OAuth token', code: 190 } }),
    ]);
    const blocked = await blockedProvider.send({
      leadId: 'L1',
      channel: 'INSTAGRAM_DM',
      recipient: VALID_IGSID,
      body: 'hello',
      contentHash: 'h',
    });
    pass(
      'IG: an unauthorized provider blocks the send',
      blocked.status === 'BLOCKED' && blocked.error === 'NOT_AUTHORIZED',
      `status=${blocked.status}`,
    );
    pass(
      'IG: no message POST was attempted while unauthorized',
      blockedCalls.length === 1,
      `calls=${blockedCalls.length}`,
    );

    /* 8. Handle instead of IGSID is refused ----------------------------------- */
    const { provider: handleProvider, calls: handleCalls } = authorizedProvider([
      () => jsonResponse(200, { id: VALID_PAGE, instagram_business_account: { id: VALID_IGSID } }),
    ]);
    const handleResult = await handleProvider.send({
      leadId: 'L1',
      channel: 'INSTAGRAM_DM',
      recipient: 'a_business_handle',
      body: 'hello',
      contentHash: 'h',
    });
    pass(
      'IG: a handle-only recipient is refused with IGSID_REQUIRED',
      handleResult.status === 'BLOCKED' && handleResult.error === 'IGSID_REQUIRED',
      handleResult.error ?? '',
    );
    pass('IG: no POST was made for a handle-only recipient', handleCalls.length === 1, `calls=${handleCalls.length}`);

    /* 9. Wrong channel is refused --------------------------------------------- */
    const { provider: emailProvider } = authorizedProvider([
      () => jsonResponse(200, { id: VALID_PAGE, instagram_business_account: { id: VALID_IGSID } }),
    ]);
    const wrongChannel = await emailProvider.send({
      leadId: 'L1',
      channel: 'EMAIL',
      recipient: VALID_IGSID,
      body: 'hello',
      contentHash: 'h',
    });
    pass(
      'IG: the Instagram adapter refuses non-Instagram channels',
      wrongChannel.status === 'BLOCKED' && wrongChannel.error === 'UNSUPPORTED_CHANNEL',
    );

    /* 10. Oversized message is refused before the API call -------------------- */
    const { provider: longProvider, calls: longCalls } = authorizedProvider([
      () => jsonResponse(200, { id: VALID_PAGE, instagram_business_account: { id: VALID_IGSID } }),
    ]);
    const tooLong = await longProvider.send({
      leadId: 'L1',
      channel: 'INSTAGRAM_DM',
      recipient: VALID_IGSID,
      body: 'x'.repeat(1200),
      contentHash: 'h',
    });
    pass(
      'IG: an over-limit message is refused locally',
      tooLong.status === 'BLOCKED' && tooLong.error === 'MESSAGE_TOO_LONG',
      tooLong.error ?? '',
    );
    pass('IG: no POST was made for an over-limit message', longCalls.length === 1, `calls=${longCalls.length}`);

    /* 11. Successful send returns the real Meta message_id -------------------- */
    const { provider: okProvider, calls: okCalls } = authorizedProvider([
      () => jsonResponse(200, { id: VALID_PAGE, instagram_business_account: { id: VALID_IGSID } }),
      () => jsonResponse(200, { recipient_id: VALID_IGSID, message_id: 'mid.SUPERSECRET123' }),
    ]);
    const sent = await okProvider.send({
      leadId: 'L1',
      channel: 'INSTAGRAM_DM',
      recipient: VALID_IGSID,
      body: 'Hello, this is D Web Studio.',
      contentHash: 'h',
    });
    pass(
      'IG: a Meta-accepted message is SENT and carries the provider message_id',
      sent.status === 'SENT' && sent.providerRef === 'mid.SUPERSECRET123',
      `status=${sent.status} ref=${sent.providerRef}`,
    );
    const postUrl = okCalls[1].url;
    const postBody = JSON.parse(String(okCalls[1].init?.body));
    pass('IG: the send uses the official Page messages endpoint', /\/v21\.0\/\d+\/messages$/.test(postUrl), postUrl);
    pass(
      'IG: the payload matches the documented recipient/message shape',
      postBody.recipient?.id === VALID_IGSID && typeof postBody.message?.text === 'string',
    );
    pass('IG: the POST carries no token in its URL', !okCalls[1].url.includes(VALID_TOKEN));

    /* 12. HTTP 200 WITHOUT a message_id is NOT a delivery --------------------- */
    const { provider: noIdProvider } = authorizedProvider([
      () => jsonResponse(200, { id: VALID_PAGE, instagram_business_account: { id: VALID_IGSID } }),
      () => jsonResponse(200, { recipient_id: VALID_IGSID }),
    ]);
    const noId = await noIdProvider.send({
      leadId: 'L1',
      channel: 'INSTAGRAM_DM',
      recipient: VALID_IGSID,
      body: 'hello',
      contentHash: 'h',
    });
    pass(
      'IG: HTTP 200 without a message_id is never reported as SENT',
      noId.status === 'FAILED' && noId.error === 'NO_MESSAGE_ID',
      `status=${noId.status}`,
    );

    /* 13. Meta policy error is not retried and is not SENT -------------------- */
    const { provider: policyProvider, calls: policyCalls } = authorizedProvider([
      () => jsonResponse(200, { id: VALID_PAGE, instagram_business_account: { id: VALID_IGSID } }),
      () => jsonResponse(400, { error: { message: 'Message Not Sent', code: 2, error_subcode: 2331049 } }),
    ]);
    const policy = await policyProvider.send({
      leadId: 'L1',
      channel: 'INSTAGRAM_DM',
      recipient: VALID_IGSID,
      body: 'hello',
      contentHash: 'h',
    });
    pass(
      'IG: a Meta policy error fails without faking delivery',
      policy.status === 'FAILED' && policy.providerRef === null,
      `status=${policy.status}`,
    );
    pass('IG: a 4xx policy error is not retried', policyCalls.length === 2, `calls=${policyCalls.length}`);

    /* 14. Retryable 5xx is retried, then succeeds ----------------------------- */
    const { provider: retryProvider, calls: retryCalls } = authorizedProvider(
      [
        () => jsonResponse(200, { id: VALID_PAGE, instagram_business_account: { id: VALID_IGSID } }),
        () => jsonResponse(503, { error: { message: 'Service unavailable', code: 2 } }),
        () => jsonResponse(200, { recipient_id: VALID_IGSID, message_id: 'mid.AFTERRETRY' }),
      ],
      { maxRetries: 2 },
    );
    const retried = await retryProvider.send({
      leadId: 'L1',
      channel: 'INSTAGRAM_DM',
      recipient: VALID_IGSID,
      body: 'hello',
      contentHash: 'h',
    });
    pass(
      'IG: a 5xx fault is retried and the later success is recorded',
      retried.status === 'SENT' && retried.providerRef === 'mid.AFTERRETRY',
      `status=${retried.status}`,
    );
    pass('IG: the retry produced a second POST', retryCalls.length === 3, `calls=${retryCalls.length}`);

    /* 15. Rate limit exhausting retries fails honestly ------------------------ */
    const { provider: rateProvider } = authorizedProvider(
      [
        () => jsonResponse(200, { id: VALID_PAGE, instagram_business_account: { id: VALID_IGSID } }),
        () => jsonResponse(429, { error: { message: 'Too many calls', code: 4 } }, { 'retry-after': '0' }),
        () => jsonResponse(429, { error: { message: 'Too many calls', code: 4 } }, { 'retry-after': '0' }),
      ],
      { maxRetries: 1 },
    );
    const rate = await rateProvider.send({
      leadId: 'L1',
      channel: 'INSTAGRAM_DM',
      recipient: VALID_IGSID,
      body: 'hello',
      contentHash: 'h',
    });
    pass(
      'IG: exhausting the rate limit reports FAILED, never SENT',
      rate.status === 'FAILED' && rate.providerRef === null,
      `status=${rate.status}`,
    );

    /* 16. Network error is handled without a fake success --------------------- */
    const { provider: netProvider } = authorizedProvider(
      [
        () => jsonResponse(200, { id: VALID_PAGE, instagram_business_account: { id: VALID_IGSID } }),
        () => {
          throw new Error('ECONNRESET');
        },
      ],
      { maxRetries: 0 },
    );
    const net = await netProvider.send({
      leadId: 'L1',
      channel: 'INSTAGRAM_DM',
      recipient: VALID_IGSID,
      body: 'hello',
      contentHash: 'h',
    });
    pass(
      'IG: a network error reports FAILED with no provider ref',
      net.status === 'FAILED' && net.providerRef === null,
      `status=${net.status}`,
    );

    /* 17. Provider selection honours the environment -------------------------- */
    pass(
      'Provider selection: dry_run stays the default with no credentials',
      selectMessagingProvider({} as any).name === 'DRY_RUN',
    );
    pass(
      'Provider selection: dry_run is honoured even when Meta creds exist',
      selectMessagingProvider({
        MESSAGING_PROVIDER: 'dry_run',
        META_PAGE_ACCESS_TOKEN: VALID_TOKEN,
        META_PAGE_ID: VALID_PAGE,
      } as any).name === 'DRY_RUN',
    );
    pass(
      'Provider selection: instagram is selected when credentials are present',
      selectMessagingProvider({
        META_PAGE_ACCESS_TOKEN: VALID_TOKEN,
        META_PAGE_ID: VALID_PAGE,
      } as any).name === 'META_INSTAGRAM_MESSAGING',
    );
    pass(
      'Provider selection: requesting instagram without credentials falls back to dry_run',
      selectMessagingProvider({ MESSAGING_PROVIDER: 'instagram' } as any).name === 'DRY_RUN',
    );
    pass(
      'Provider selection: an unknown provider name falls back to dry_run',
      selectMessagingProvider({ MESSAGING_PROVIDER: 'not-a-real-provider' } as any).name === 'DRY_RUN',
    );
  } catch (err: any) {
    pass('Messaging adapter: test block completed without an unexpected error', false, err?.message);
  }

  return results;
}
