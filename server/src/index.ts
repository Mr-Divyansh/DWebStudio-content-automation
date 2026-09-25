import express from 'express';
import dotenv from 'dotenv';
import { authRouter, requireOperatorAuth } from './api/auth.js';
import { leadRouter } from './api/routes/leadRoutes.js';
import { importRouter } from './api/routes/importRoutes.js';
import { learningRouter } from './api/routes/learningRoutes.js';
import { dashboardRouter } from './api/routes/dashboardRoutes.js';
import { portfolioRouter } from './api/routes/portfolioRoutes.js';
import { configRouter, vaultRouter } from './api/routes/configRoutes.js';
import { agentRouter } from './api/routes/agentRoutes.js';
import { initializeMessagingProviders } from './agent/messagingProvider.js';
import { applyVaultToEnv } from './api/vault.js';
import { webhookRouter } from './api/routes/webhookRoutes.js';
import { AutonomousAgent } from './agent/autonomousAgent.js';
import { seedDatabase } from './database/seed.js';

dotenv.config();
applyVaultToEnv();

export function createExpressApp() {
  const app = express();

  // Selects the messaging adapter once at startup. Defaults to dry-run unless an
  // authorized provider is fully configured in the environment.
  initializeMessagingProviders();

  // Raw body is retained so Meta webhook signatures (X-Hub-Signature-256) can be
  // verified against the exact bytes Meta signed. Never logged, never persisted.
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Authentication and health are intentionally public. The webhook is
  // mounted before the operator gate because Meta cannot present a browser
  // session; its own HMAC/verification-token checks are the security boundary.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
      const { FollowUpService } = await import('./agent/followUpService.js');
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

  return app;
}

export async function startStandaloneServer(port = process.env.PORT || 3001) {
  const app = createExpressApp();
  await seedDatabase();

  return app.listen(port, () => {
    console.log(`[D Web Studio Lead AI] Backend API server running on http://localhost:${port}`);
  });
}

/**
 * Standalone API bootstrap.
 *
 * IMPORTANT: importing this module must never open a listening socket, because
 * the Vercel serverless entry (`api/index.ts`) imports `createExpressApp` from
 * here. A listening server inside a serverless function is both wrong and
 * resource-wasteful, so the standalone listener is now strictly opt-in via
 * DWS_START_STANDALONE_API=true.
 *
 * Local development uses `npm run dev` (server.ts), which is unaffected.
 */
if (process.env.DWS_START_STANDALONE_API === 'true') {
  void startStandaloneServer();
}
