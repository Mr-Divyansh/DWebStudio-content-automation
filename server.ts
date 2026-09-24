import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { leadRouter } from './server/src/api/routes/leadRoutes.js';
import { importRouter } from './server/src/api/routes/importRoutes.js';
import { learningRouter } from './server/src/api/routes/learningRoutes.js';
import { dashboardRouter } from './server/src/api/routes/dashboardRoutes.js';
import { portfolioRouter } from './server/src/api/routes/portfolioRoutes.js';
import { configRouter } from './server/src/api/routes/configRoutes.js';
import { agentRouter } from './server/src/api/routes/agentRoutes.js';
import { initializeMessagingProviders } from './server/src/agent/messagingProvider.js';
import { webhookRouter } from './server/src/api/routes/webhookRoutes.js';
import { seedDatabase } from './server/src/database/seed.js';

dotenv.config();

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
      limit: '50mb',
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API Routes
  app.use('/api/leads', leadRouter);
  app.use('/api/import', importRouter);
  app.use('/api/learnings', learningRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/portfolio', portfolioRouter);
  app.use('/api/config', configRouter);
  app.use('/api/agent', agentRouter);
  app.use('/api/webhooks', webhookRouter);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'D Web Studio Lead AI',
      timestamp: new Date().toISOString(),
    });
  });

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
