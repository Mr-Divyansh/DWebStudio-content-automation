import { prisma } from '../database/client.js';
import { getMessagingProvider, hashMessage } from './messagingProvider.js';
import { isFollowUpEligible, FOLLOW_UP_STAGES } from './replyEngine.js';
import { runSendSafetyGates, checkFollowUpDelay } from './safety.js';

export interface FollowUpRunReport {
  checked: number;
  sent: number;
  blocked: number;
  failed: number;
  skipped: number;
}

function buildContextualFollowUp(stage: string, offer: string | null): string {
  const subject = offer && offer !== 'UNKNOWN' ? ` the ${offer} discussion` : ' our conversation';
  if (stage === 'PRICING') {
    return `Hi, just following up${subject}. Would you like me to share the configured package details and next step?`;
  }
  if (stage === 'REQUIREMENTS') {
    return `Hi, just checking in${subject}. Would you like help confirming the key pages and features you need?`;
  }
  return `Hi, just checking in${subject}. Would you like a short, relevant outline and the next step?`;
}

async function logEvent(type: string, message: string, status: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'HUMAN_REQUIRED', leadId?: string) {
  await prisma.agentEvent.create({ data: { type, message, status, leadId: leadId || null } });
}

export class FollowUpService {
  static async runDue(limit = 10): Promise<FollowUpRunReport> {
    const boundedLimit = Math.max(1, Math.min(25, limit));
    const report: FollowUpRunReport = { checked: 0, sent: 0, blocked: 0, failed: 0, skipped: 0 };
    const config = await prisma.agentConfig.findUnique({ where: { id: 'singleton' } });
    if (!config?.autoDm) {
      report.skipped = boundedLimit;
      return report;
    }

    const provider = getMessagingProvider();
    if (!provider.isConfigured) {
      report.skipped = boundedLimit;
      await logEvent('FOLLOW_UP_PROVIDER_UNAVAILABLE', 'Follow-up run stopped: no authorized messaging provider is configured.', 'WARNING');
      return report;
    }
    const auth = provider.checkAuthorization ? await provider.checkAuthorization() : { authorized: false, reason: 'Provider cannot verify authorization.' };
    if (!auth.authorized) {
      report.skipped = boundedLimit;
      await logEvent('FOLLOW_UP_PROVIDER_UNAUTHORIZED', 'Follow-up run stopped: provider authorization failed.', 'HUMAN_REQUIRED');
      return report;
    }


    const now = new Date();
    const candidates = await prisma.lead.findMany({
      where: {
        followUpNeeded: true,
        followUpNextAt: { lte: now },
        doNotContact: false,
        aiPaused: false,
        instagramScopedId: { not: null },
        messagingAuthorizedAt: { not: null },
        conversationStage: { in: [...FOLLOW_UP_STAGES] },
      },
      orderBy: { followUpNextAt: 'asc' },
      take: Math.max(boundedLimit * 3, 20),
    });

    for (const lead of candidates) {
      if (report.sent + report.blocked + report.failed >= boundedLimit) break;
      if (!isFollowUpEligible(lead)) {
        report.skipped++;
        continue;
      }
      report.checked++;
      const body = buildContextualFollowUp(lead.conversationStage, lead.offerDiscussed);
      const contentHash = hashMessage(lead.id, body);
      const delayGate = checkFollowUpDelay(lead.lastOutboundAt, Math.max(1, config.followUpDelayHours));
      const verdict = delayGate.allowed
        ? await runSendSafetyGates({
            lead,
            leadId: lead.id,
            contentHash,
            channel: 'INSTAGRAM_DM',
            autoDm: true,
            providerConfigured: true,
            providerAuthorized: true,
            maxSendsPerHour: config.maxSendsPerHour,
            maxSendsPerLead: config.maxSendsPerLead,
          })
        : delayGate;
      if (!verdict.allowed) {
        report.blocked++;
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            followUpNeeded: false,
            followUpNextAt: null,
            status: verdict.escalate ? 'HUMAN_REQUIRED' : lead.status,
            conversationStage: verdict.escalate ? 'HUMAN_REQUIRED' : lead.conversationStage,
          },
        });
        await logEvent('FOLLOW_UP_BLOCKED', `Follow-up blocked: ${verdict.reason}`, verdict.escalate ? 'HUMAN_REQUIRED' : 'WARNING', lead.id);
        continue;
      }

      const result = await provider.send({
        leadId: lead.id,
        channel: 'INSTAGRAM_DM',
        recipient: lead.instagramScopedId,
        body,
        contentHash,
      });
      await prisma.outboundMessage.create({
        data: {
          leadId: lead.id,
          channel: 'INSTAGRAM_DM',
          recipient: lead.instagramScopedId,
          body,
          contentHash,
          status: result.status,
          provider: result.provider,
          providerRef: result.providerRef ?? null,
          error: result.error ?? null,
        },
      });
      if (result.status !== 'SENT') {
        report.failed++;
        await prisma.lead.update({
          where: { id: lead.id },
          data: { followUpNeeded: false, followUpNextAt: null, status: 'HUMAN_REQUIRED', conversationStage: 'HUMAN_REQUIRED' },
        });
        await logEvent('FOLLOW_UP_FAILED', result.detail, 'ERROR', lead.id);
        continue;
      }

      const attempts = lead.followUpAttempts + 1;
      const exhausted = attempts >= Math.min(3, Math.max(1, lead.followUpMaxAttempts));
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: 'AI_CONVERSATION',
          conversationStage: 'FOLLOW_UP',
          lastOutboundAt: new Date(),
          lastAgentActionAt: new Date(),
          followUpAttempts: attempts,
          followUpNeeded: !exhausted,
          followUpNextAt: exhausted ? null : new Date(Date.now() + Math.max(1, config.followUpDelayHours) * 60 * 60 * 1000),
        },
      });
      await prisma.agentConfig.update({
        where: { id: 'singleton' },
        data: { messagesSent: { increment: 1 } },
      }).catch(() => undefined);
      report.sent++;
      await logEvent('FOLLOW_UP_SENT', 'Bounded contextual follow-up delivered through the official provider.', 'SUCCESS', lead.id);
    }
    return report;
  }
}
