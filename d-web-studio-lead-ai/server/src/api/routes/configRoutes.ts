import { Router } from 'express';
import { isGeminiConfigured } from '../../ai/gemini.js';
import { checkDatabaseConnection } from '../../database/client.js';
import { InstagramZipExtractor } from '../../importers/instagram/instagramZipExtractor.js';
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
