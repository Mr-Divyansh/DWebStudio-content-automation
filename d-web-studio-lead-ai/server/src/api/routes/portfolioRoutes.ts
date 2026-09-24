import { Router } from 'express';
import { PortfolioService } from '../../services/portfolioService.js';

export const portfolioRouter = Router();

portfolioRouter.get('/', async (_req, res) => {
  try {
    const projects = await PortfolioService.getAllProjects();
    res.json(projects);
  } catch (err: any) {
    console.error('Error fetching portfolio:', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch portfolio' });
  }
});
