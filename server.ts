import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authRouter, requireOperatorAuth } from './server/src/api/auth.js';
import { leadRouter } from './server/src/api/routes/leadRoutes.js';
import { importRouter } from './server/src/api/routes/importRoutes.js';
import { learningRouter } from './server/src/api/routes/learningRoutes.js';
import { dashboardRouter } from './server/src/api/routes/dashboardRoutes.js';
import { portfolioRouter } from './server/src/api/routes/portfolioRoutes.js';
import { configRouter, vaultRouter } from './server/src/api/routes/configRoutes.js';
import { agentRouter } from './server/src/api/routes/agentRoutes.js';
import { initializeMessagingProviders } from './server/src/agent/messagingProvider.js';
import { applyVaultToEnv } from './server/src/api/vault.js';
import { webhookRouter } from './server/src/api/routes/webhookRoutes.js';
import { AutonomousAgent } from './server/src/agent/autonomousAgent.js';
import { seedDatabase } from './server/src/database/seed.js';

dotenv.config();
applyVaultToEnv();

// Selects the messaging adapter (dry-run unless an authorized provider is configured).
initializeMessagingProviders();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isProd = process.env.NODE_ENV === 'production';

  // Raw body is retained so Meta webhook signatures can be verified against the
  // exact bytes Meta signed. Never logged, never persisted.
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Public health/auth/webhook endpoints. All other API routes require the
  // operator session in production; the webhook authenticates with Meta HMAC.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'D Web Studio Lead AI', timestamp: new Date().toISOString() });
  });
  app.use('/api/auth', authRouter);
  app.use('/api/webhooks', webhookRouter);
  app.get('/api/cron/agent', async (req, res) => {
    const expected = process.env.CRON_SECRET?.trim();
    const supplied = req.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!expected || supplied !== expected) return res.status(401).json({ error: 'Unauthorized' });
    try {
      res.json(await AutonomousAgent.tick());
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Agent tick failed' });
    }
  });
  app.get('/api/cron/follow-ups', async (req, res) => {
    const expected = process.env.CRON_SECRET?.trim();
    const supplied = req.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!expected || supplied !== expected) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const { FollowUpService } = await import('./server/src/agent/followUpService.js');
      res.json(await FollowUpService.runDue(10));
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Follow-up run failed' });
    }
  });
  app.use('/api', requireOperatorAuth);

  // Private API Routes
  app.use('/api/leads', leadRouter);
  app.use('/api/import', importRouter);
  app.use('/api/learnings', learningRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/portfolio', portfolioRouter);
  app.use('/api/config', configRouter);
  app.use('/api/vault', vaultRouter);
  app.use('/api/agent', agentRouter);

  // Seed database with verified knowledge, portfolio, and initial demo leads if empty
  await seedDatabase();

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[D Web Studio Lead AI] Ready at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
