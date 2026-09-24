import express from 'express';
import dotenv from 'dotenv';
import { leadRouter } from './api/routes/leadRoutes.js';
import { importRouter } from './api/routes/importRoutes.js';
import { learningRouter } from './api/routes/learningRoutes.js';
import { dashboardRouter } from './api/routes/dashboardRoutes.js';
import { portfolioRouter } from './api/routes/portfolioRoutes.js';
import { configRouter } from './api/routes/configRoutes.js';
import { seedDatabase } from './database/seed.js';

dotenv.config();

export function createExpressApp() {
  const app = express();

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API Routes
  app.use('/api/leads', leadRouter);
  app.use('/api/import', importRouter);
  app.use('/api/learnings', learningRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/portfolio', portfolioRouter);
  app.use('/api/config', configRouter);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}

export async function startStandaloneServer(port = process.env.PORT || 3001) {
  const app = createExpressApp();
  await seedDatabase();

  return app.listen(port, () => {
    console.log(`[D Web Studio Lead AI] Backend API server running on http://localhost:${port}`);
  });
}

if (process.argv[1] && process.argv[1].endsWith('index.ts')) {
  startStandaloneServer();
}
