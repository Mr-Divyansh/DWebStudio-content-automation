/**
 * PROVIDER SETUP REQUIREMENTS
 * ============================================================================
 * Answers the only question the Connected Accounts UI could not previously ask:
 * "the Connect button does nothing — so what EXACTLY does an administrator have
 * to do?"
 *
 * WHY THIS EXISTS
 * The old contract exposed `unavailableReason(): string`, a single sentence like
 * "Discord sign-in has not been set up by the administrator yet." That sentence
 * is not actionable: it names neither the variables nor the console screens. The
 * only UI options it supported were "disable the button" or "hide it".
 *
 * This module turns that sentence into a structured, copyable checklist so the
 * button can stay CLICKABLE and open a real setup screen instead.
 *
 * SECURITY CONTRACT (enforced by tests/authConnections.test.ts)
 *   - Only environment variable NAMES are ever returned.
 *   - No value, no length, no prefix. Never `KEY=value`.
 *   - Nothing here is ever logged.
 *
 * Each provider reads its own already-exported `*Config()` function, so there is
 * exactly ONE definition of what a provider requires (in its adapter) and this
 * file never becomes a second, drifting source of truth.
 */

import { discordConfig, DISCORD_SCOPES } from './discord.js';
import { gmailConfig, GMAIL_SCOPES } from './gmail.js';
import { instagramConfig, INSTAGRAM_SCOPES } from './instagram.js';
import { telegramConfig } from './telegram.js';
import { whatsappConfig } from './whatsapp.js';
import { callbackUri, type Platform, type ProviderSetup } from './types.js';

/** True when a value is present and not just whitespace. */
function has(value: string | undefined): boolean {
  return Boolean((value ?? '').trim());
}

/** Drops the nulls produced by the ternary readability pattern below. */
function compact(values: (string | null)[]): string[] {
  return values.filter((v): v is string => v !== null);
}

/**
 * Assembles the setup payload. Values are never touched — only their absence is
 * already known at this point.
 */
function build(
  platform: Platform,
  required: string[],
  missing: string[],
  extra: Omit<ProviderSetup, 'missing' | 'required' | 'redirectUri'>,
  env: NodeJS.ProcessEnv,
): ProviderSetup {
  return {
    missing,
    required,
    requiresProviderApproval: extra.requiresProviderApproval,
    summary: extra.summary,
    steps: extra.steps,
    redirectUri: callbackUri(platform, env),
    docsUrl: extra.docsUrl,
  };
}

export function instagramSetup(env: NodeJS.ProcessEnv = process.env): ProviderSetup {
  const cfg = instagramConfig(env);
  return build(
    'INSTAGRAM',
    ['META_APP_ID', 'META_APP_SECRET'],
    compact([has(cfg.appId) ? null : 'META_APP_ID', has(cfg.appSecret) ? null : 'META_APP_SECRET']),
    {
      requiresProviderApproval: true,
      summary:
        "Instagram uses Meta's official Instagram Platform (Facebook Login for Business). An administrator finishes the Meta app setup once, for all users.",
      steps: [
        "Create a Meta Business app and add the Instagram product.",
        'Request Advanced Access for: ' + INSTAGRAM_SCOPES.join(', ') + '.',
        'Register the redirect URI below under Facebook Login → Valid OAuth redirect URIs.',
        'Add META_APP_ID and META_APP_SECRET to the server .env file, then restart the server.',
        "Optional: set META_INSTAGRAM_CONFIG_ID to use Meta's one-click Embedded Signup instead of the classic OAuth dialog.",
      ],
      docsUrl: 'https://developers.facebook.com/docs/instagram-platform',
    },
    env,
  );
}

export function whatsappSetup(env: NodeJS.ProcessEnv = process.env): ProviderSetup {
  const cfg = whatsappConfig(env);
  return build(
    'WHATSAPP',
    ['META_APP_ID', 'META_APP_SECRET', 'META_EMBEDDED_SIGNUP_CONFIG_ID'],
    compact([
      has(cfg.appId) ? null : 'META_APP_ID',
      has(cfg.appSecret) ? null : 'META_APP_SECRET',
      has(cfg.configId) ? null : 'META_EMBEDDED_SIGNUP_CONFIG_ID',
    ]),
    {
      requiresProviderApproval: true,
      summary:
        'WhatsApp connects through the official Meta WhatsApp Business Platform (Cloud API). Meta must approve the app before any business number can be connected.',
      steps: [
        'Become a Meta Tech Provider and create a Business app.',
        'Add the WhatsApp product and apply for Advanced Access on whatsapp_business_management and whatsapp_business_messaging.',
        'Facebook Login for Business → Configurations → create an Embedded Signup configuration and copy its CONFIGURATION ID.',
        "Register the redirect URI below, then add this app's domain to Allowed domains.",
        'Set META_APP_ID, META_APP_SECRET and META_EMBEDDED_SIGNUP_CONFIG_ID in the server .env file, then restart.',
        "A WhatsApp Web QR scan is NOT supported — that method is unofficial and violates WhatsApp's terms.",
      ],
      docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
    },
    env,
  );
}
export function gmailSetup(env: NodeJS.ProcessEnv = process.env): ProviderSetup {
  const cfg = gmailConfig(env);
  return build(
    'GMAIL',
    ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    compact([has(cfg.clientId) ? null : 'GOOGLE_CLIENT_ID', has(cfg.clientSecret) ? null : 'GOOGLE_CLIENT_SECRET']),
    {
      requiresProviderApproval: false,
      summary:
        'Gmail connects through official Google OAuth 2.0. An administrator registers an OAuth client once, for all users.',
      steps: [
        'In Google Cloud Console, enable the Gmail API for the project.',
        'Google Auth Platform → Clients → Create an OAuth client (Web application).',
        'Add the redirect URI below under Authorised redirect URIs. It must match EXACTLY, including the port.',
        'Set the consent screen user type to EXTERNAL, then add each user email under Test users.',
        'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the server .env file, then restart the server.',
        'Requested read-only scopes: ' + GMAIL_SCOPES.join(', ') + '.',
      ],
      docsUrl: 'https://developers.google.com/identity/protocols/oauth2/web-server',
    },
    env,
  );
}

export function discordSetup(env: NodeJS.ProcessEnv = process.env): ProviderSetup {
  const cfg = discordConfig(env);
  return build(
    'DISCORD',
    ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'],
    compact([
      has(cfg.clientId) ? null : 'DISCORD_CLIENT_ID',
      has(cfg.clientSecret) ? null : 'DISCORD_CLIENT_SECRET',
    ]),
    {
      requiresProviderApproval: false,
      summary:
        'Discord connects through the official Discord OAuth2 flow with PKCE. An administrator creates one application, for all users.',
      steps: [
        'Open the Discord Developer Portal and create a New Application.',
        'OAuth2 → Redirects → add the redirect URI below (it must match exactly).',
        'Copy the Client ID and Client Secret.',
        'Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in the server .env file, then restart the server.',
        'Requested scopes: ' + DISCORD_SCOPES.join(', ') + ' — identity only, no message access.',
      ],
      docsUrl: 'https://discord.com/developers/docs/topics/oauth2',
    },
    env,
  );
}

export function telegramSetup(env: NodeJS.ProcessEnv = process.env): ProviderSetup {
  const cfg = telegramConfig(env);
  return build(
    'TELEGRAM',
    ['TELEGRAM_BOT_ID', 'TELEGRAM_BOT_USERNAME', 'TELEGRAM_BOT_TOKEN'],
    compact([
      has(cfg.botId) ? null : 'TELEGRAM_BOT_ID',
      has(cfg.botUsername) ? null : 'TELEGRAM_BOT_USERNAME',
      has(cfg.botToken) ? null : 'TELEGRAM_BOT_TOKEN',
    ]),
    {
      requiresProviderApproval: false,
      summary:
        'Telegram connects through the official Telegram Login Widget. An administrator creates a bot once, for all users.',
      steps: [
        'Create a bot with @BotFather and copy the bot token.',
        "Record the numeric bot id and the @username BotFather assigns.",
        'Send /setdomain to @BotFather and register this app domain, so the widget may appear here.',
        'Set TELEGRAM_BOT_ID, TELEGRAM_BOT_USERNAME and TELEGRAM_BOT_TOKEN in the server .env file, then restart.',
        "The bot token is only used server-side to verify Telegram's HMAC. It is never sent to the browser, and users are never asked to paste it.",
      ],
      docsUrl: 'https://core.telegram.org/widgets/login',
    },
    env,
  );
}

const SETUP_BUILDERS: Record<Platform, (env?: NodeJS.ProcessEnv) => ProviderSetup> = {
  INSTAGRAM: instagramSetup,
  WHATSAPP: whatsappSetup,
  GMAIL: gmailSetup,
  DISCORD: discordSetup,
  TELEGRAM: telegramSetup,
};

/** The setup payload for any platform. Safe to return to the browser. */
export function providerSetup(platform: Platform, env: NodeJS.ProcessEnv = process.env): ProviderSetup {
  return SETUP_BUILDERS[platform](env);
}