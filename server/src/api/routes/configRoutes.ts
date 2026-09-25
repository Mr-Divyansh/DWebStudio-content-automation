import { Router } from 'express';
import { isGeminiConfigured } from '../../ai/gemini.js';
import { checkDatabaseConnection } from '../../database/client.js';
import { InstagramZipExtractor } from '../../importers/instagram/instagramZipExtractor.js';
import { getVaultStatus, saveVaultSecrets } from '../vault.js';
import fs from 'fs';

export const configRouter = Router();

configRouter.get('/', async (_req, res) => {
  const dbStatus = await checkDatabaseConnection();
  const exportFolder = InstagramZipExtractor.getExportFolder();
  let zipFiles: string[] = [];
  try {
    if (fs.existsSync(exportFolder)) {
      zipFiles = fs.readdirSync(exportFolder).filter((f) => f.toLowerCase().endsWith('.zip'));
    }
  } catch {}

  const geminiReady = isGeminiConfigured();

  res.json({
    system: 'D Web Studio Lead AI',
    version: '1.0.0',
    geminiConfigured: geminiReady,
    mode: geminiReady ? 'AI_ACTIVE' : 'DEMO_MODE',
    databaseConnected: dbStatus.ok,
    databaseError: dbStatus.error,
    instagramExportFolder: exportFolder,
    discoveredZips: zipFiles,
  });
});

export const vaultRouter = Router();

/** Keys kabhi values ke saath nahi — sirf SET / NOT SET + kahan se aayi. */
vaultRouter.get('/status', (_req, res) => {
  res.json({ keys: getVaultStatus() });
});

/** UI se keys save karo — encrypted vault me, turant active (no restart). */
vaultRouter.post('/save', async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const entries: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.secrets ?? body)) {
      if (typeof v === 'string') entries[k] = v;
    }
    if (Object.keys(entries).length === 0) {
      return res.status(400).json({ error: 'Koi key nahi mili. Pehle ek key paste karo.' });
    }
    const result = await saveVaultSecrets(entries);
    res.json({ ...result, keys: getVaultStatus() });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Keys save nahi ho payi.' });
  }
});
