/**
 * AUTHENTICATION & PLATFORM CONNECTION TESTS
 * ============================================================================
 * Security properties of the new layers:
 *   - scrypt password hashing (correct / wrong / malformed input)
 *   - AES-256-GCM token encryption + AAD binding to userId:platform
 *   - session create / resolve / revoke semantics
 *   - OAuth state: single-use, expiry, user binding
 *   - Telegram Login Widget HMAC verification (the real algorithm)
 *   - connection persistence and CROSS-USER isolation
 *   - "no token ever reaches an API response"
 *
 * No network calls are made: only pure crypto and database logic are exercised.
 */

import { prisma } from '../server/src/database/client.js';
import {
  encryptSecret,
  decryptSecret,
  hashPassword,
  verifyPassword,
  isTokenEncryptionConfigured,
  sha256Hex,
} from '../server/src/api/secretStore.js';
import { UserService, normalizeEmail, MIN_PASSWORD_LENGTH } from '../server/src/api/userService.js';
import { ConnectionService } from '../server/src/connections/connectionService.js';
import { verifyTelegramAuth } from '../server/src/connections/telegram.js';
import { allAdapters, getAdapter } from '../server/src/connections/adapters.js';
import { PLATFORMS, PLATFORM_LABELS, PLATFORM_ORDER, isPlatform } from '../server/src/connections/types.js';
import { isInstagramConfigured, isInstagramEmbeddedSignupConfigured, INSTAGRAM_SCOPES } from '../server/src/connections/instagram.js';
import { isGmailConfigured, GMAIL_SCOPES } from '../server/src/connections/gmail.js';
import { isDiscordConfigured } from '../server/src/connections/discord.js';
import { isTelegramConfigured } from '../server/src/connections/telegram.js';
import { isWhatsAppConfigured } from '../server/src/connections/whatsapp.js';
import { createHmac, createHash } from 'node:crypto';

interface TestResult {
  name: string;
  passed: boolean;
  message?: string;
}

const TEST_KEY = 'test-encryption-key-that-is-definitely-long-enough-32+';

async function check(name: string, fn: () => Promise<string | void> | string | void): Promise<TestResult> {
  try {
    const message = await fn();
    return { name, passed: true, message: message || undefined };
  } catch (err: any) {
    return { name, passed: false, message: err?.message || String(err) };
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Produces a genuine Telegram Login Widget payload plus its official signature. */
function makeTelegramPayload(botToken: string, overrides: Record<string, string> = {}) {
  const fields: Record<string, string> = {
    id: '424242',
    first_name: 'Asha',
    username: 'asha',
    auth_date: String(Math.floor(Date.now() / 1000)),
    ...overrides,
  };
  const checkString = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = createHash('sha256').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(checkString).digest('hex');
  return { ...fields, hash };
}

/** Asserts that a call throws, and returns the thrown error. */
async function expectReject(fn: () => Promise<unknown> | unknown): Promise<any> {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected the call to be rejected, but it succeeded');
}
export async function runAuthAndConnectionTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const previousKey = process.env.DWS_TOKEN_ENCRYPTION_KEY;
  process.env.DWS_TOKEN_ENCRYPTION_KEY = TEST_KEY;

  const stamp = Date.now();
  const emailA = `auth-a-${stamp}@example.com`;
  const emailB = `auth-b-${stamp}@example.com`;
  const password = 'correct horse battery';

  let userA: any = null;
  let userB: any = null;

  try {
    /* ------------------------------------------------------------ passwords */

    results.push(
      await check('Password: scrypt hash verifies the correct password', () => {
        const hash = hashPassword(password);
        assert(hash.startsWith('scrypt$'), 'hash is not in the scrypt format');
        assert(!hash.includes(password), 'the plaintext password leaked into the hash');
        assert(verifyPassword(password, hash), 'the correct password did not verify');
      }),
    );

    results.push(
      await check('Password: a wrong password does not verify', () => {
        const hash = hashPassword(password);
        assert(!verifyPassword('wrong password', hash), 'a wrong password was accepted');
      }),
    );

    results.push(
      await check('Password: the same password hashes differently each time (salted)', () => {
        assert(hashPassword(password) !== hashPassword(password), 'hashes are identical: the salt is not random');
      }),
    );

    results.push(
      await check('Password: malformed stored hashes fail closed', () => {
        for (const bad of ['', 'nonsense', 'scrypt$x$y$z', 'bcrypt$1$2$3$4']) {
          assert(!verifyPassword(password, bad), `malformed hash "${bad}" was accepted`);
        }
      }),
    );

    /* ---------------------------------------------------------- encryption */

    results.push(
      await check('Token storage: refuses to run without a real encryption key', () => {
        const env = { DWS_TOKEN_ENCRYPTION_KEY: 'too-short' } as NodeJS.ProcessEnv;
        assert(!isTokenEncryptionConfigured(env), 'a 9-char key was reported as configured');
        let threw = false;
        try {
          encryptSecret('secret-token', 'user:DISCORD', env);
        } catch {
          threw = true;
        }
        assert(threw, 'encryption proceeded with an insufficient key');
      }),
    );

    results.push(
      await check('Token storage: encrypts and decrypts a round trip', () => {
        const aad = 'user-1:DISCORD';
        const cipher = encryptSecret('super-secret-oauth-token', aad);
        assert(!cipher.includes('super-secret'), 'plaintext token is visible in the ciphertext');
        assert(decryptSecret(cipher, aad) === 'super-secret-oauth-token', 'round trip failed');
      }),
    );

    results.push(
      await check('Token storage: AAD blocks cross-user token replay', () => {
        const stolen = encryptSecret('user-A-token', 'user-A:DISCORD');
        // Same ciphertext, pasted into user B's row: it must NOT decrypt.
        assert(decryptSecret(stolen, 'user-B:DISCORD') === null, 'a token decrypted under the wrong user');
        assert(decryptSecret(stolen, 'user-A:TELEGRAM') === null, 'a token decrypted under the wrong platform');
      }),
    );

    results.push(
      await check('Token storage: tampered ciphertext is rejected', () => {
        const aad = 'user-1:WHATSAPP';
        const cipher = encryptSecret('meta-business-token', aad);
        const parts = cipher.split('.');
        const flipped = Buffer.from(parts[4], 'base64url');
        flipped[0] ^= 0xff;
        const tampered = [...parts.slice(0, 4), flipped.toString('base64url')].join('.');
        assert(decryptSecret(tampered, aad) === null, 'tampered ciphertext decrypted successfully');
      }),
    );
/* ------------------------------------------------------------- accounts */

    results.push(
      await check('Email: normalisation and validation', () => {
        assert(normalizeEmail('  Person@Example.COM ') === 'person@example.com', 'email was not normalised');
        assert(normalizeEmail('not-an-email') === '', 'an invalid email was accepted');
        assert(normalizeEmail(null) === '', 'null was accepted');
      }),
    );

    userA = await UserService.register({ email: emailA, password, name: 'User A' });
    results.push(
      await check('Registration: creates a user without exposing the password hash', () => {
        assert(userA.email === emailA, 'email was not stored as given');
        assert(!('passwordHash' in userA), 'the returned object contains a passwordHash field');
        assert(!JSON.stringify(userA).includes(password), 'the password appears in the returned user');
        return `id=${userA.id} role=${userA.role}`;
      }),
    );

    results.push(
      await check('Registration: duplicate email is rejected without revealing it', async () => {
        const err = await expectReject(() => UserService.register({ email: emailA, password }));
        assert(err.status === 409, `expected HTTP 409, got ${err.status}`);
        assert(!/already|exists|taken|registered/i.test(err.message), 'the error reveals that the email is registered');
      }),
    );

    results.push(
      await check('Registration: a short password is rejected', async () => {
        const err = await expectReject(() =>
          UserService.register({ email: `short-${stamp}@example.com`, password: 'a'.repeat(MIN_PASSWORD_LENGTH - 1) }),
        );
        assert(err.status === 400, `expected HTTP 400, got ${err.status}`);
      }),
    );

    userB = await UserService.register({ email: emailB, password });

    results.push(
      await check('Login: correct credentials authenticate, wrong ones do not', async () => {
        const ok = await UserService.authenticate({ email: emailA, password });
        assert(ok.id === userA.id, 'login returned the wrong user');
        const err = await expectReject(() => UserService.authenticate({ email: emailA, password: 'nope' }));
        assert(err.status === 401, `expected HTTP 401, got ${err.status}`);
      }),
    );

    results.push(
      await check('Login: unknown email and wrong password give an identical error', async () => {
        const a = await expectReject(() => UserService.authenticate({ email: `ghost-${stamp}@example.com`, password }));
        const b = await expectReject(() => UserService.authenticate({ email: emailA, password: 'bad' }));
        assert(a.message === b.message, `errors differ and allow account enumeration: ${JSON.stringify([a.message, b.message])}`);
      }),
    );

    /* ------------------------------------------------------------- sessions */

    let sessionToken = '';
    results.push(
      await check('Session: issues a token, resolves a user, and stores only a hash', async () => {
        sessionToken = await UserService.createSession(userA.id, { userAgent: 'jest', ipAddress: '127.0.0.1' });
        const resolved = await UserService.resolveSession(sessionToken);
        assert(resolved?.id === userA.id, 'the session did not resolve to its user');
        const row = await prisma.authSession.findFirst({ where: { userId: userA.id } });
        assert(row?.tokenHash === sha256Hex(sessionToken), 'the raw token was stored instead of its hash');
        assert(row?.tokenHash !== sessionToken, 'the raw token is present in the database');
        return `tokenHash=${String(row?.tokenHash).slice(0, 12)}...`;
      }),
    );

    results.push(
      await check('Session: garbage and empty tokens resolve to nothing', async () => {
        assert((await UserService.resolveSession('not-a-real-token')) === null, 'a garbage token resolved to a user');
        assert((await UserService.resolveSession(null)) === null, 'a null token resolved to a user');
        assert((await UserService.resolveSession('')) === null, 'an empty token resolved to a user');
      }),
    );

    results.push(
      await check('Session: logout revokes the token server-side', async () => {
        await UserService.destroySession(sessionToken);
        assert((await UserService.resolveSession(sessionToken)) === null, 'a revoked session still resolves');
      }),
    );

    results.push(
      await check('Session: a user token resolves only to its own user', async () => {
        const tokenB = await UserService.createSession(userB.id);
        const resolved = await UserService.resolveSession(tokenB);
        assert(resolved?.id === userB.id, 'session resolved to the wrong user');
        await UserService.destroySession(tokenB);
      }),
    );
/* ----------------------------------------------------------- telegram HMAC */

    const botToken = '123456789:AAHtest-token-value-for-hmac-only';

    results.push(
      await check('Telegram: a genuine widget payload is accepted', () => {
        const verified = verifyTelegramAuth(makeTelegramPayload(botToken) as any, botToken);
        assert(verified.id === '424242', 'wrong id extracted');
        assert(verified.firstName === 'Asha', 'wrong name extracted');
        return `id=${verified.id} username=${verified.username}`;
      }),
    );

    results.push(
      await check('Telegram: a tampered field invalidates the signature', async () => {
        const payload = makeTelegramPayload(botToken);
        // Attacker swaps the identity but keeps the original signature.
        const err = await expectReject(() =>
          verifyTelegramAuth({ ...payload, id: '999999', first_name: 'Mallory' } as any, botToken),
        );
        assert(err.reason === 'TELEGRAM_SIGNATURE_INVALID', `unexpected reason: ${err.reason}`);
      }),
    );

    results.push(
      await check('Telegram: a payload signed with a different bot is rejected', async () => {
        const payload = makeTelegramPayload('999:some-other-bots-token');
        const err = await expectReject(() => verifyTelegramAuth(payload as any, botToken));
        assert(err.reason === 'TELEGRAM_SIGNATURE_INVALID', `unexpected reason: ${err.reason}`);
      }),
    );

    results.push(
      await check('Telegram: a stale authorization is rejected (replay protection)', async () => {
        const old = makeTelegramPayload(botToken, { auth_date: String(Math.floor(Date.now() / 1000) - 60 * 60 * 48) });
        const err = await expectReject(() => verifyTelegramAuth(old as any, botToken));
        assert(err.reason === 'TELEGRAM_EXPIRED', `unexpected reason: ${err.reason}`);
      }),
    );

    /* ---------------------------------------------------------- OAuth state */

    results.push(
      await check('OAuth state: is single-use, so a replay fails', async () => {
        const { state } = await ConnectionService.createState('DISCORD', 'https://example.test/cb', userA.id);
        assert((await ConnectionService.consumeState('DISCORD', state, userA.id)) !== null, 'the first consumption failed');
        assert((await ConnectionService.consumeState('DISCORD', state, userA.id)) === null, 'the same state was accepted twice');
      }),
    );

    results.push(
      await check('OAuth state: cannot be replayed by a different user', async () => {
        const { state } = await ConnectionService.createState('DISCORD', 'https://example.test/cb', userA.id);
        assert((await ConnectionService.consumeState('DISCORD', state, userB.id)) === null, 'user B consumed user A state');
        // Clean up so the pending row does not linger.
        await ConnectionService.consumeState('DISCORD', state, userA.id).catch(() => null);
      }),
    );

    results.push(
      await check('OAuth state: rejects unknown, expired and cross-platform states', async () => {
        assert((await ConnectionService.consumeState('DISCORD', 'made-up-state', null)) === null, 'a fake state worked');

        const { state } = await ConnectionService.createState('DISCORD', 'https://example.test/cb', null);
        // Expire the row the way the passage of time would.
        await prisma.oAuthState.updateMany({ where: { stateHash: sha256Hex(state) }, data: { expiresAt: new Date(0) } });
        assert((await ConnectionService.consumeState('DISCORD', state, null)) === null, 'an expired state was accepted');

        const { state: s2 } = await ConnectionService.createState('TELEGRAM', '', null);
        assert((await ConnectionService.consumeState('DISCORD', s2, null)) === null, 'a Telegram state was accepted by Discord');
      }),
    );
/* ----------------------------------------------------------- connections */

    results.push(
      await check('Connections: a fresh user sees every platform as not connected', async () => {
        const list = await ConnectionService.listForUser(userB.id);
        assert(list.length === PLATFORMS.length, `expected ${PLATFORMS.length} platform cards, got ${list.length}`);
        for (const item of list) {
          assert(item.connected === false, `${item.platform} reported as connected for a fresh user`);
          assert(item.status === 'NOT_CONNECTED', `${item.platform} has status ${item.status}`);
        }
        return list.map((i) => i.platform).join(', ');
      }),
    );

    results.push(
      await check('Connections: the API summary never contains a token or ciphertext', async () => {
        const serialised = JSON.stringify(await ConnectionService.listForUser(userA.id));
        for (const forbidden of ['accessToken', 'access_token', 'Ciphertext', 'refreshToken', 'passwordHash']) {
          assert(!serialised.includes(forbidden), `the connections API leaked "${forbidden}"`);
        }
      }),
    );

    results.push(
      await check('Connections: a verified connection is stored encrypted and marked connected', async () => {
        await ConnectionService.saveVerified(userA.id, 'DISCORD', {
          externalAccountId: 'discord-123',
          displayName: 'asha#0001',
          username: 'asha',
          scopes: ['identify', 'email'],
          accessToken: 'discord-access-token-value',
          refreshToken: 'discord-refresh-token-value',
          tokenExpiresAt: new Date(Date.now() + 3_600_000),
          metadata: { discordUserId: 'discord-123' },
        });

        const summary = await ConnectionService.findForUser(userA.id, 'DISCORD');
        assert(summary?.connected === true, 'the connection was not marked connected');
        assert(summary?.username === 'asha', 'the username was not stored');
        assert(summary?.lastVerifiedAt !== null, 'lastVerifiedAt was not recorded');

        // Raw database check: the plaintext token must not be present.
        const row = await prisma.connectedAccount.findUnique({
          where: { userId_platform: { userId: userA.id, platform: 'DISCORD' } },
        });
        assert(row!.accessTokenCiphertext !== 'discord-access-token-value', 'the access token was stored in plaintext');
        assert(!String(row!.accessTokenCiphertext).includes('discord-access-token'), 'the token leaks into the ciphertext');
        assert(row!.refreshTokenCiphertext !== 'discord-refresh-token-value', 'the refresh token was stored in plaintext');

        // ...and it must decrypt back on the server for automation use.
        assert(
          (await ConnectionService.readAccessToken(userA.id, 'DISCORD')) === 'discord-access-token-value',
          'the server could not read back its own token',
        );
      }),
    );

    results.push(
      await check('Connections: a token cannot be read through another user id', async () => {
        assert((await ConnectionService.readAccessToken(userB.id, 'DISCORD')) === null, "user B read user A's Discord token");
        const stolenMeta = await ConnectionService.readMetadata(userB.id, 'DISCORD');
        assert(Object.keys(stolenMeta).length === 0, "user B read user A's connection metadata");
      }),
    );

    results.push(
      await check('Connections: one user cannot see another user connection cards', async () => {
        const listB = await ConnectionService.listForUser(userB.id);
        const discordB = listB.find((i) => i.platform === 'DISCORD')!;
        assert(discordB.connected === false, "user B sees user A's Discord connection as connected");
      }),
    );

    results.push(
      await check('Connections: a failed attempt is never recorded as connected', async () => {
        await ConnectionService.markError(userA.id, 'WHATSAPP', 'Meta rejected the authorization.');
        const summary = await ConnectionService.findForUser(userA.id, 'WHATSAPP');
        assert(summary?.connected === false, 'a failed attempt was recorded as connected');
        assert(summary?.status === 'ERROR', `expected status ERROR, got ${summary?.status}`);
        assert(String(summary?.lastError).includes('Meta rejected'), 'the error message was not recorded');
      }),
    );

    results.push(
      await check('Connections: disconnect removes the row and its credential', async () => {
        await ConnectionService.disconnect(userA.id, 'DISCORD');
        const remaining = await prisma.connectedAccount.count({
          where: { userId: userA.id, platform: 'DISCORD' },
        });
        assert(remaining === 0, 'the connection row survived disconnect');
        assert((await ConnectionService.readAccessToken(userA.id, 'DISCORD')) === null, 'the token survived disconnect');
      }),
    );
/* ------------------------------------------ provider coverage: no config leaks */

    results.push(
      await check('Providers: all five platforms are registered and labelled', () => {
        const expected = ['INSTAGRAM', 'WHATSAPP', 'GMAIL', 'DISCORD', 'TELEGRAM'];
        assert(
          JSON.stringify(PLATFORMS) === JSON.stringify(expected),
          `unexpected platform list: ${PLATFORMS.join(', ')}`,
        );
        for (const platform of PLATFORMS) {
          assert(Boolean(PLATFORM_LABELS[platform]), `${platform} has no label`);
          assert(typeof PLATFORM_ORDER[platform] === 'number', `${platform} has no render order`);
          assert(getAdapter(platform).platform === platform, `${platform} adapter is mis-registered`);
        }
        assert(allAdapters().length === PLATFORMS.length, 'adapter count does not match platform count');
        return PLATFORMS.map((p) => PLATFORM_LABELS[p]).join(', ');
      }),
    );

    results.push(
      await check('Providers: unknown platform names are rejected by the allow-list', () => {
        for (const bad of ['SLACK', 'slack', 'INSTAGRAM ', '', '../etc', 'WHATSAPP; DROP TABLE']) {
          assert(!isPlatform(bad), `platform "${bad}" was accepted`);
        }
        assert(isPlatform('INSTAGRAM'), 'INSTAGRAM was rejected');
        assert(isPlatform('GMAIL'), 'GMAIL was rejected');
      }),
    );

    results.push(
      await check('Providers: unconfigured providers report unavailable, never fake success', () => {
        // Hermetic: a developer shell may already export real provider values
        // (e.g. from a running dev server), which would make this test lie.
        const PROVIDER_ENV_KEYS = [
          'META_APP_ID',
          'META_APP_SECRET',
          'META_INSTAGRAM_CONFIG_ID',
          'META_EMBEDDED_SIGNUP_CONFIG_ID',
          'GOOGLE_CLIENT_ID',
          'GOOGLE_CLIENT_SECRET',
          'DISCORD_CLIENT_ID',
          'DISCORD_CLIENT_SECRET',
          'TELEGRAM_BOT_ID',
          'TELEGRAM_BOT_USERNAME',
          'TELEGRAM_BOT_TOKEN',
        ];
        const saved: Record<string, string | undefined> = {};
        for (const key of PROVIDER_ENV_KEYS) {
          saved[key] = process.env[key];
          delete process.env[key];
        }
        try {
          for (const adapter of allAdapters()) {
            assert(adapter.isConfigured() === false, `${adapter.platform} claimed to be configured with no credentials`);
            const reason = adapter.unavailableReason();
            assert(typeof reason === 'string' && reason.length > 0, `${adapter.platform} has no unavailableReason`);
            assert(
              !/=|api[_ ]?key|secret/i.test(reason),
              `${adapter.platform} reason leaks technical detail: ${reason}`,
            );
          }
        } finally {
          for (const key of PROVIDER_ENV_KEYS) {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
          }
        }
        return '5/5 report unavailable with a human-readable reason';
      }),
    );

    results.push(
      await check('Providers: Instagram asks only for official Instagram Platform scopes', () => {
        const allowed = new Set(['instagram_basic', 'pages_show_list', 'instagram_manage_messages', 'business_management']);
        for (const scope of INSTAGRAM_SCOPES) {
          assert(allowed.has(scope), `unexpected Instagram scope requested: ${scope}`);
        }
        return INSTAGRAM_SCOPES.join(', ');
      }),
    );

    results.push(
      await check('Providers: Gmail requests read-only scopes and never mail write access', () => {
        assert(GMAIL_SCOPES.includes('https://www.googleapis.com/auth/gmail.readonly'), 'gmail.readonly missing');
        for (const forbidden of [
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.modify',
          'https://mail.google.com/',
          'https://www.googleapis.com/auth/drive',
        ]) {
          assert(!GMAIL_SCOPES.includes(forbidden), `Gmail must not request ${forbidden} (least privilege)`);
        }
        return GMAIL_SCOPES.map((s) => s.split('/').pop()).join(', ');
      }),
    );

    results.push(
      await check('Providers: Instagram Embedded Signup needs app id, secret AND config id', () => {
        const base = { META_APP_ID: 'a', META_APP_SECRET: 'b' } as NodeJS.ProcessEnv;
        assert(isInstagramConfigured(base), 'app id + secret should be enough for the dialog fallback');
        assert(!isInstagramEmbeddedSignupConfigured(base), 'Embedded Signup must require a config id');
        assert(
          isInstagramEmbeddedSignupConfigured({ ...base, META_INSTAGRAM_CONFIG_ID: 'cfg' } as NodeJS.ProcessEnv),
          'config id should enable Embedded Signup',
        );
        assert(
          !isInstagramEmbeddedSignupConfigured({ META_APP_ID: 'a', META_INSTAGRAM_CONFIG_ID: 'cfg' } as NodeJS.ProcessEnv),
          'Embedded Signup must not work without the app secret',
        );
      }),
    );
results.push(
      await check('Connections: Gmail stores the verified address and encrypts both tokens', async () => {
        await ConnectionService.saveVerified(userA.id, 'GMAIL', {
          externalAccountId: 'google-sub-123',
          displayName: 'Demo Owner',
          username: 'owner@example.com',
          scopes: GMAIL_SCOPES,
          accessToken: 'ya29.fake-google-access-token',
          refreshToken: '1//fake-google-refresh-token',
          tokenExpiresAt: new Date(Date.now() + 3_600_000),
          metadata: { email: 'owner@example.com', emailVerified: 'true', googleSubject: 'google-sub-123' },
        });

        const summary = await ConnectionService.findForUser(userA.id, 'GMAIL');
        assert(summary?.connected === true, 'Gmail was not marked connected');
        assert(summary?.accountEmail === 'owner@example.com', 'the verified Gmail address is not exposed to the UI');

        const row = await prisma.connectedAccount.findUnique({
          where: { userId_platform: { userId: userA.id, platform: 'GMAIL' } },
        });
        assert(!String(row?.accessTokenCiphertext).includes('ya29.'), 'the Google access token is stored in plaintext');
        assert(!String(row?.refreshTokenCiphertext).includes('1//'), 'the Google refresh token is stored in plaintext');
        assert(
          (await ConnectionService.readRefreshToken(userA.id, 'GMAIL')) === '1//fake-google-refresh-token',
          'the server cannot read back its own refresh token',
        );
      }),
    );

    results.push(
      await check('Connections: Instagram stores identifiers but never the page token in the clear', async () => {
        await ConnectionService.saveVerified(userA.id, 'INSTAGRAM', {
          externalAccountId: '17841400000000001',
          displayName: 'D Web Studio',
          username: '@dwebstudio',
          scopes: INSTAGRAM_SCOPES,
          accessToken: 'EAAFakeInstagramPageToken',
          refreshToken: null,
          tokenExpiresAt: null,
          metadata: { igsid: '17841400000000001', igUsername: 'dwebstudio', pageId: '134895793791914' },
        });

        const summary = await ConnectionService.findForUser(userA.id, 'INSTAGRAM');
        assert(summary?.connected === true, 'Instagram was not marked connected');
        assert(summary?.username === '@dwebstudio', 'the Instagram handle is not shown');

        const row = await prisma.connectedAccount.findUnique({
          where: { userId_platform: { userId: userA.id, platform: 'INSTAGRAM' } },
        });
        assert(!String(row?.accessTokenCiphertext).includes('EAAFake'), 'the Instagram page token is stored in plaintext');
        const meta = await ConnectionService.readMetadata(userA.id, 'INSTAGRAM');
        assert(meta.pageId === '134895793791914', 'the non-secret page id is not available to the automation layer');
      }),
    );

    results.push(
      await check('Connections: disconnect clears Gmail and Instagram tokens too', async () => {
        await ConnectionService.disconnect(userA.id, 'GMAIL');
        assert((await prisma.connectedAccount.count({ where: { userId: userA.id, platform: 'GMAIL' } })) === 0,
          'the Gmail row survived disconnect');
        assert((await ConnectionService.readAccessToken(userA.id, 'GMAIL')) === null, 'the Gmail token survived disconnect');
        assert((await ConnectionService.readRefreshToken(userA.id, 'GMAIL')) === null, 'the Gmail refresh token survived');

        await ConnectionService.disconnect(userA.id, 'INSTAGRAM');
        assert((await prisma.connectedAccount.count({ where: { userId: userA.id, platform: 'INSTAGRAM' } })) === 0,
          'the Instagram row survived disconnect');
      }),
    );

    results.push(
      await check('Connections: a forged callback cannot attach a provider to another user', async () => {
        // The state row decides the owner, so a client-supplied user id is never
        // trusted on the callback path.
        const { state } = await ConnectionService.createState('GMAIL', 'https://example.test/cb', userA.id);
        const asB = await ConnectionService.consumeState('GMAIL', state, userB.id);
        assert(asB === null, 'user B completed a flow started by user A');
        await ConnectionService.consumeState('GMAIL', state, userA.id).catch(() => null);
      }),
    );
} finally {
    /* -------------------------------------------------------------- cleanup */
    if (userA && userB) {
      await prisma.connectedAccount.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
      await prisma.oAuthState.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
      await prisma.authSession.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
      await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    }
    if (previousKey === undefined) delete process.env.DWS_TOKEN_ENCRYPTION_KEY;
    else process.env.DWS_TOKEN_ENCRYPTION_KEY = previousKey;
  }

  return results;
}
