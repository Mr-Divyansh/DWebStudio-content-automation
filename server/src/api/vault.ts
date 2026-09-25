/**
 * OWNER SECRET VAULT — UI se API keys save karo, .env touch nahi.
 * AES-256-GCM encrypted local file (.vault.json, git-ignored).
 * Env vars hamesha vault se upar (precedence). Values kabhi browser ko nahi.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const VAULT_KEYS = [
  'GEMINI_API_KEY',
  'META_PAGE_ACCESS_TOKEN',
  'META_PAGE_ID',
  'META_APP_SECRET',
  'META_WEBHOOK_VERIFY_TOKEN',
  'MESSAGING_PROVIDER',
] as const;
export type VaultKeyName = (typeof VAULT_KEYS)[number];
const ALLOWED = new Set<string>(VAULT_KEYS);
const vaultPath = () => path.resolve(process.cwd(), '.vault.json');
const saltPath = () => path.resolve(process.cwd(), '.vault.salt');

function encKey(): Buffer {
  const fromEnv = (process.env.DWS_SESSION_SECRET ?? '').trim();
  let salt: Buffer;
  try {
    if (fs.existsSync(saltPath())) salt = fs.readFileSync(saltPath());
    else { salt = randomBytes(16); fs.writeFileSync(saltPath(), salt, { mode: 0o600 }); }
  } catch { salt = Buffer.from('dws-local-vault', 'utf8'); }
  return scryptSync(fromEnv || 'dws-local-dev-vault-key', salt, 32);
}
function readFile(): Record<string, string> {
  try {
    if (!fs.existsSync(vaultPath())) return {};
    const raw = JSON.parse(fs.readFileSync(vaultPath(), 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch { return {}; }
}
function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', encKey(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${enc.toString('base64url')}`;
}
function decrypt(p: string): string {
  const [a, b, d] = p.split('.');
  const decipher = createDecipheriv('aes-256-gcm', encKey(), Buffer.from(a, 'base64url'));
  decipher.setAuthTag(Buffer.from(b, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(d, 'base64url')), decipher.final()]).toString('utf8');
}
export function isVaultKey(n: string): n is VaultKeyName { return ALLOWED.has(n); }
export function readVaultSecrets(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [n, p] of Object.entries(readFile())) {
    if (!isVaultKey(n)) continue;
    try { const v = decrypt(p).trim(); if (v) out[n] = v; } catch { /* skip */ }
  }
  return out;
}
export function applyVaultToEnv(): void {
  for (const [n, v] of Object.entries(readVaultSecrets())) {
    if (!(process.env[n] ?? '').trim()) process.env[n] = v;
  }
}
export function getVaultStatus() {
  const stored = readFile();
  const defs = [
    { name: 'GEMINI_API_KEY', purpose: 'AI brain — free key: aistudio.google.com', required: true },
    { name: 'META_PAGE_ACCESS_TOKEN', purpose: 'Real Instagram sending (Meta API)', required: false },
    { name: 'META_PAGE_ID', purpose: 'Facebook Page ID linked to Instagram', required: false },
    { name: 'META_APP_SECRET', purpose: 'Verifies incoming reply webhooks', required: false },
    { name: 'META_WEBHOOK_VERIFY_TOKEN', purpose: 'Webhook verify token (aap khud chuno)', required: false },
    { name: 'MESSAGING_PROVIDER', purpose: '"instagram" = real send, else draft-only', required: false },
  ];
  return defs.map((k) => {
    const envSet = Boolean((process.env[k.name] ?? '').trim());
    let vaultSet = false;
    if (!envSet && stored[k.name]) {
      try { vaultSet = Boolean(decrypt(stored[k.name]).trim()); } catch { vaultSet = false; }
    }
    return { ...k, set: envSet || vaultSet, source: envSet ? 'ENV' : vaultSet ? 'VAULT' : 'MISSING' };
  });
}
export async function saveVaultSecrets(entries: Record<string, string>) {
  const stored = readFile();
  const saved: string[] = [];
  for (const [rawN, rawV] of Object.entries(entries)) {
    const n = String(rawN).trim(), v = String(rawV ?? '').trim();
    if (!isVaultKey(n)) continue;
    if (!v) { delete stored[n]; continue; }
    if (n === 'MESSAGING_PROVIDER' && !['instagram', 'dry_run'].includes(v.toLowerCase()))
      throw new Error('MESSAGING_PROVIDER must be "instagram" or "dry_run".');
    stored[n] = encrypt(v);
    process.env[n] = v;
    saved.push(n);
  }
  fs.writeFileSync(vaultPath(), JSON.stringify(stored, null, 2), { mode: 0o600 });
  try { (await import('../agent/messagingProvider.js')).initializeMessagingProviders(); } catch { /* restart pe */ }
  try { (await import('../ai/gemini.js')).resetGeminiClient(); } catch { /* ignore */ }
  return { saved };
}
