import { Router } from 'express';
import { LeadService } from '../../services/leadService.js';
import { prisma } from '../../database/client.js';

export const dashboardRouter = Router();

dashboardRouter.get('/', async (_req, res) => {
  try {
    const stats = await LeadService.getDashboardStats();

    // Recent activity log (latest leads, analyses, drafts)
    const recentLeads = await prisma.lead.findMany({
      take: 6,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        businessName: true,
        personName: true,
        niche: true,
        source: true,
        status: true,
        intent: true,
        updatedAt: true,
        followUpNeeded: true,
        suggestedNextAction: true,
      },
    });

    const recentDrafts = await prisma.outreachDraft.findMany({
      take: 4,
      orderBy: { createdAt: 'desc' },
      include: {
        lead: {
          select: {
            businessName: true,
            niche: true,
          },
        },
      },
    });

    const recentLearnings = await prisma.learning.findMany({
      take: 4,
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      ...stats,
      recentLeads,
      recentDrafts,
      recentLearnings,
    });
  } catch (err: any) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch dashboard' });
  }
});
