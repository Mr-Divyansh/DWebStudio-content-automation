# Connected Accounts — Setup & Developer Guide

> **Who reads this?** A D Web Studio administrator, **once**. A normal user never
> reads this file, never sees a key field, and never configures anything.

---

## 1. The three separate concepts

This project deliberately keeps three things apart. They live in separate
directories and must stay that way.

| Concern | Question it answers | Where it lives |
|---|---|---|
| **Application login** | Who is using D Web Studio Lead AI? | `server/src/api/auth.ts`, `server/src/api/userService.ts` |
| **Platform connection** | Which WhatsApp/Discord/Telegram account is linked? | `server/src/connections/*`, `server/src/api/routes/connectionRoutes.ts` |
| **Automation** | What should the Lead AI do with it? | `server/src/agent/*` (unchanged) |

Authentication never contains automation logic, and automation never reads a
password. A connection stores a credential; it does not decide what to send.

---

## 2. What a normal user sees

```
Open app  ->  Login / Create account  ->  Dashboard  ->  Connected Accounts
                                                          |
                              Instagram  [ Connect ]
                              WhatsApp   [ Connect ]
                              Gmail      [ Connect ]
                              Discord    [ Connect ]
                              Telegram   [ Connect ]
                                                          |
                                          authorize on the platform
                                                          |
                                    Connected -> [ Manage ] [ Disconnect ]
```

There is **no field anywhere in this flow** for an API key, access token,
cookie, session file, page ID, phone ID or password. The user presses one button
and authenticates on the platform's own domain.

---

## 2b. Providers and what each one actually uses

| Platform | Official mechanism | Credential stored | Minimum scopes |
|---|---|---|---|
| **Instagram** | Facebook Login for Business (Instagram Platform) | Page access token (encrypted) | `instagram_basic`, `pages_show_list`, `instagram_manage_messages`, `business_management` |
| **WhatsApp** | Meta Embedded Signup (Cloud API) | Business token (encrypted) | via Embedded Signup config |
| **Gmail** | Google OAuth 2.0 + PKCE | Access **and** refresh token (encrypted) | `gmail.readonly`, `userinfo.email`, `openid` |
| **Discord** | OAuth2 Authorization Code + PKCE | Access + refresh token (encrypted) | `identify`, `email` |
| **Telegram** | Official Login Widget | **none** — the widget issues no token | n/a |

`gmail.send` / `gmail.modify` are deliberately **not** requested: the app does
not send mail yet, so asking for write access would break least privilege.

---

## 2c. Important: Instagram requires a professional account

The Instagram Platform supports only **Instagram Business or Creator** accounts
that are **linked to a Facebook Page**. A personal Instagram account cannot be
connected — not by this app, and not by any compliant app.

If a user connects an account that does not meet this, Meta rejects the grant
and the card shows a clear `ERROR` with the reason. Nothing is faked.

---

## 3. What is deliberately NOT implemented

These are refused on purpose, not because they are missing:

- **WhatsApp Web QR scanning / session hijacking / unofficial clients.**
  This violates WhatsApp's Terms of Service, gets business numbers banned, and
  cannot legally ship. Meta's official Embedded Signup is used instead.
- **Collecting a user's WhatsApp, Discord or Telegram password.** No platform
  integration should ever ask our users for a password.
- **Storing a WhatsApp Web session.** There is no code path that can create one.
- **Marking an account "connected" without platform verification.** No API
  endpoint sets `status = CONNECTED` directly; it is only written after the
  platform itself confirms the credential.

If a platform cannot provide a login-based flow through its supported
mechanisms, this document says so plainly instead of shipping a workaround.

---

## 4. One-time administrator setup

### 4.1 Required for every platform

```bash
# .env — generate a unique value, never commit it
DWS_TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 48)"
```

All platform tokens are encrypted with AES-256-GCM under this key before being
stored. Without it, connections are reported as unavailable (correctly) rather
than stored under a weak key.

> Rotating this key invalidates every stored connection token, so users must
> reconnect afterwards.

### 4.2 Instagram (Meta) — shares the Meta app with WhatsApp

Instagram uses the same `META_APP_ID` / `META_APP_SECRET` as WhatsApp.

1. In the Meta app, add the **Facebook Login** product (for Business, if the app
   is a Business app) and the **Instagram** product.
2. Request **Advanced Access** for:
   - `instagram_basic`
   - `pages_show_list`
   - `instagram_manage_messages` (needed to read and reply to DMs)
   - `business_management`
3. Register the redirect URI `${APP_URL}/api/connections/instagram/callback`
   under **Facebook Login → Settings → Valid OAuth redirect URIs**.
4. *(Optional, recommended)* Create a **Facebook Login for Business**
   configuration using the **Embedded Signup** variation and set:

```bash
META_INSTAGRAM_CONFIG_ID="..."
```

**With** `META_INSTAGRAM_CONFIG_ID` the Connect button opens Meta's Embedded
Signup popup (the same smooth one-click UX as WhatsApp).
**Without** it, the app falls back to Meta's standard Facebook OAuth dialog
redirect, which needs only the app id and secret.

Both paths are official. Neither asks for an Instagram password.

### 4.3 Gmail (Google OAuth 2.0)

1. [Google Cloud Console](https://console.cloud.google.com/) → create/select a project.
2. Enable the **Gmail API**.
3. **Credentials** → **Create credentials** → **OAuth client ID** →
   application type **Web application**.
4. Add the authorized redirect URI:

```
https://<your-host>/api/connections/gmail/callback
```

5. Copy the client ID and client secret.

```bash
GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="..."
```

Scopes requested (minimum only):

| Scope | Why |
|---|---|
| `gmail.readonly` | read messages and threads |
| `userinfo.email` | show the connected address in the UI |
| `openid` | identity verification |

> While the app is in **Testing** mode, Google only lets you sign in with the
> account listed as a *Test user* on the OAuth consent screen. Add your account
> under **Google Auth Platform → Audience → Test users**. This is Google's rule,
> not an application limitation.

A refresh token is requested (`access_type=offline`), so the connection keeps
working after the user leaves. If the user later revokes access at their Google
account, the stored token stops working and the card reports *"please
reconnect"* rather than silently failing.

### 4.4 Discord — easiest

1. <https://discord.com/developers/applications> → **New Application**.
2. **OAuth2** → add redirect URL: `${APP_URL}/api/connections/discord/callback`.
3. Copy the **Client ID** and **Client Secret**.

```bash
DISCORD_CLIENT_ID="..."
DISCORD_CLIENT_SECRET="..."
```

Only `identify email` is requested. No message-sending permission is asked for
at connect time, and no guild is joined.
### 4.3 Telegram — easy

1. Message **@BotFather** → `/newbot` → copy the token.
2. `/setdomain` → enter this app's domain (e.g. `app.dwebstudio.in`).
3. Get the bot id and username.

```bash
TELEGRAM_BOT_ID="..."
TELEGRAM_BOT_USERNAME="..."   # without the leading @
TELEGRAM_BOT_TOKEN="..."
```

The token is used **only on the server** to verify the widget's HMAC signature.
It is never sent to the browser. No Telegram password is ever requested.

> Telegram's Login Widget proves *identity only*. To actually send messages a
> bot must additionally be configured, which is a separate concern.

### 4.4 WhatsApp — the most involved, and gated by Meta

Meta only permits this flow for an approved **Tech Provider / Solution Partner**
app. A normal customer cannot self-serve this; you do it once for them.

1. Apply to become a [Meta Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers).
2. Create a **Business app**; add the **WhatsApp** product.
3. Apply for **Advanced Access** on `whatsapp_business_management` and
   `whatsapp_business_messaging`.
4. **Facebook Login for Business** → **Client OAuth settings** → enable *Client
   OAuth login*, *Web OAuth login*, *Enforce HTTPS*, *Login with the JavaScript
   SDK*, and *use Strict Mode for redirect URIs*.
5. **Configurations** → create one → login variation **Embedded Signup** →
   select the **Cloud API** product → copy the **configuration id**.
6. Add your domain to **Allowed domains**.

```bash
META_APP_ID="..."
META_APP_SECRET="..."
META_EMBEDDED_SIGNUP_CONFIG_ID="..."
META_GRAPH_API_VERSION="v21.0"
```

Then register the webhook (so inbound replies reach the Lead AI):

```
https://<your-host>/api/webhooks/whatsapp
```

Fields: `messages`. Set `META_WEBHOOK_VERIFY_TOKEN` to your own random value.

**If Meta has not approved your app yet**, the Connect button is still clickable
but opens the **setup screen** instead of starting a flow. It names the exact
missing environment variables, lists the Meta approval steps, and says
"Provider approval/setup required". This is honest: the system will not pretend
to connect, and it will not fall back to QR automation.

---

## 6. When a provider is not configured

**No Connect button is ever disabled.** A missing environment variable used to
grey out the button, which told the user nothing and left them stuck. Each card
now renders one of four honest states:

| State | Button | What it does |
|---|---|---|
| `READY` | **Connect** | Starts the real official authorization flow |
| `CONNECTED` | **Manage / Disconnect** | Re-verifies with the provider, or revokes |
| `SETUP_REQUIRED` | **Setup** | Opens the setup checklist for that provider |
| `AUTHORIZATION_FAILED` | **Retry** | Restarts the flow after a provider error |
| `UNAVAILABLE` | **View details** | Server-side storage problem; retrying will not help |

`POST /api/connections/:platform/connect` returns **HTTP 200** with
`{ "action": "setup_required", "setup": {...} }` for an unconfigured provider,
rather than a 503. No OAuth state row is created for a flow that cannot start.

### What the setup screen shows

- **Status** — "Not configured on this server"
- **Missing** — the environment variable **names** that are absent
- **Steps** — numbered, provider-specific administrator instructions
- **Redirect URI** — the exact string to register, with a copy button
- **Docs link** — the provider's official documentation

Variable **values are never displayed or requested**. The API response type has
no field that could carry a value, so a secret cannot reach the browser even if
the component were rewritten badly. `POST /api/connections/GMAIL/connect` never
returns a token.

### Where these states appear

- **Connected Accounts** — the five provider cards
- **Channel page** — one page per provider
- **Command Center** — "Channel health" (status · account · last verified ·
  action) and the **Attention Required** panel

---

## 7. Reading an authorization error

Provider OAuth errors are mapped to their real cause rather than collapsed into
one generic message. Google's consent screen returns errors **without** an
authorization code, so the old handler reported "did not return an
authorization code" for misconfigurations that had nothing to do with codes.

| Provider error | Shown to the user |
|---|---|
| `redirect_uri_mismatch` | The exact redirect URI to register, including the port |
| `org_internal` | Set the consent screen to EXTERNAL and add a test user |
| `unauthorized_client` / `invalid_client` | Check the client type and registered URIs |
| `invalid_scope` | The API may be disabled, or Advanced Access is needed |
| `access_denied` | Authorization was cancelled |
| *(no error, no code)* | The callback URL was opened directly — press Connect again |

The provider's `error_description` is **never** echoed into the redirect,
because it can contain a client ID and is attacker-influenceable.

### Redirect URI resolution

Every redirect URI comes from one helper, `appOrigin()`:

1. `APP_URL` if set
2. otherwise `http://localhost:${PORT}`
3. otherwise `http://localhost:3300`

This guarantees the URI is always **absolute**. Deriving it from `APP_URL` alone
silently produced the relative string `/api/connections/gmail/callback` when the
variable was unset, which no provider can match — a confusing failure with no
obvious cause.

> Embedded Signup **v2** is deprecated by Meta on **15 October 2026**. This
> integration targets **v4** (`sessionInfoVersion: '3'`).

---

## 5. Cost and honesty

A user does **not** pay for, or configure, an API just to connect an account.

That said, the UI does not hide genuine platform costs:

| Item | Who pays | When |
|---|---|---|
| D Web Studio subscription | User | Product decision |
| Meta app review / Business verification | D Web Studio (admin) | One time |
| WhatsApp conversation-based pricing | Business owner | Per conversation, set in WhatsApp Manager |
| Meta Hosting (Tech Provider) | D Web Studio (admin) | Monthly, if applicable |

If a platform imposes a real fee, it is surfaced as a platform requirement — not
hidden, and not replaced with a "free API" that does not work.
---

## 6. Security model

### Tokens at rest
- AES-256-GCM, per-value random salt + IV.
- **AAD = `userId:platform`.** A ciphertext copied into another user's row fails
  to decrypt — this is the server-side half of cross-user isolation.
- A `DWS_TOKEN_ENCRYPTION_KEY` shorter than 32 characters is refused.

### Tokens in transit to the browser
- The connections API returns a fixed `ConnectionSummary` built field by field.
  There is no code path that serialises `accessTokenCiphertext`.
- A test asserts the serialised response contains no `accessToken`,
  `Ciphertext`, `refreshToken` or `passwordHash` substring.

### Passwords
- scrypt (`N=16384, r=8, p=1`) with a per-user salt, parameters stored inline.
- Never logged, never returned, never stored in plaintext.

### Sessions
- 256-bit random token in an `HttpOnly`, `SameSite=Lax` cookie
  (`Secure` in production).
- Only `sha256(token)` is persisted, so a database dump cannot be replayed.
- Logout revokes the row server-side. Login is rate-limited per IP.

### OAuth
- `state` is stored **hashed**, is **single-use**, expires in 10 minutes, and is
  **bound to the userId that started the flow**.
- Discord additionally uses PKCE (`S256`).
- A state presented by a different user is rejected.

### Webhooks
- Meta webhooks remain HMAC-verified against the raw body, and are mounted
  outside the browser auth gate because Meta cannot present a session.

### Tenant isolation
- Every connection query is filtered by `userId`. There is no "get connection by
  id" without an owner check.
- The operator credential vault (`/api/vault`) is now **OWNER-only**; a normal
  member receives `403`.

---

## 7. Known limitations

1. **Lead data is still single-tenant.** Connections and authentication are fully
   scoped per user, but the pre-existing `Lead`/`Conversation` tables have no
   owner column, so all application users currently share one lead database.
   Adding tenant scoping to those tables is the main remaining work.
2. **Telegram cannot verify an existing session live.** The Login Widget has no
   introspection endpoint, so "Manage" reports the cryptographic proof captured
   at connect time. This is stated in the UI rather than faked.
3. **WhatsApp availability depends on Meta approval**, not on us.
4. **Discord refresh tokens** are stored, but automatic refresh is not yet wired
   into the automation layer; a long-expired token requires reconnecting.
5. **WhatsApp inbound webhooks** are documented above but the route is not yet
   implemented in this repository.

---

## 8. Running the tests

```bash
npm test
```

195 checks run, covering the existing Lead AI engine plus the new auth and
connection security properties (scrypt hashing, token encryption and AAD
binding, session lifecycle, OAuth state single-use and user binding, the real
Telegram HMAC algorithm, cross-user isolation, and "no token in the response"),
plus provider coverage for all five platforms (registration, labels, scope
least-privilege, unconfigured providers reporting honestly).

> On Windows the process may print a libuv assertion
> (`UV_HANDLE_CLOSING`) *after* the summary line. This is a Node/Windows exit
> quirk unrelated to the suite: the summary shows the real pass/fail counts.

---

## 9. Verified locally vs. requires provider credentials

| Check | Result |
|---|---|
| Type check (`npm run lint`) | clean |
| Tests (`npm test`) | 195 passed, 0 failed |
| Build (`npm run build`) | succeeds |
| Register / login / logout | works |
| All five cards render, correct availability | works |
| Connect payloads contain no secrets | verified |
| Forged OAuth callback rejected (all providers) | verified |
| Unknown platform + path traversal → 404 | verified |
| Bogus Meta code → honest `ERROR`, never "Connected" | verified |
| Disconnect clears rows and tokens (all five) | verified |
| Dashboard / Leads unaffected | HTTP 200 |

**Not verifiable without production credentials** (implemented correctly, but
untested against the live provider): the real Instagram grant, the real Gmail
consent round-trip, and the WhatsApp Embedded Signup approval. These require a
live Meta app and a Google Cloud project.