/**
 * AUTONOMOUS AGENT — Safety Gates
 * ============================================================================
 * Every check here is deterministic and runs BEFORE any send attempt. A single
 * failing gate stops the action and, when appropriate, escalates to a human.
 * There is deliberately no AI call in this file: safety must not depend on a model.
 *
 * Gates: human take-over, opt-out / do-not-contact, duplicate outreach, hourly
 * rate limit, per-lead cap, follow-up delay, contact availability, price bounds.
 */

import { prisma } from '../database/client.js';

export type SafetyVerdict =
  | { allowed: true }
  | { allowed: false; code: string; reason: string; escalate: boolean };

export const HUMAN_REQUIRED = 'HUMAN_REQUIRED';

const ALLOW: SafetyVerdict = { allowed: true };
const deny = (code: string, reason: string, escalate = false): SafetyVerdict => ({
  allowed: false,
  code,
  reason,
  escalate,
});

/** A human took over this chat, or an opt-out was recorded. */
export function checkLeadMessagingAllowed(lead: {
  aiPaused?: boolean;
  doNotContact?: boolean;
  optOutAt?: Date | null;
}): SafetyVerdict {
  if (lead.doNotContact || lead.optOutAt) {
    return deny('OPT_OUT', 'Lead is marked DO_NOT_CONTACT / opted out.', false);
  }
  if (lead.aiPaused) {
    return deny('HUMAN_TAKEOVER', 'Human has taken over this conversation.', false);
  }
  return ALLOW;
}

/** Never send the same lead the same body twice. */
export async function checkDuplicateSend(leadId: string, contentHash: string): Promise<SafetyVerdict> {
  const existing = await prisma.outboundMessage.findFirst({
    where: { leadId, contentHash, status: { in: ['SENT', 'DRY_RUN'] } },
  });
  if (existing) return deny('DUPLICATE_MESSAGE', 'Identical message already logged for this lead.', false);
  return ALLOW;
}

/** Per-lead cap, regardless of how the content differs. */
export async function checkPerLeadCap(leadId: string, maxSendsPerLead: number): Promise<SafetyVerdict> {
  const count = await prisma.outboundMessage.count({
    where: { leadId, status: { in: ['SENT', 'DRY_RUN'] } },
  });
  if (count >= maxSendsPerLead) {
    return deny('PER_LEAD_LIMIT', `Lead already has ${count} logged message(s); limit is ${maxSendsPerLead}.`, true);
  }
  return ALLOW;
}

/** Global hourly cap across the agent. */
export async function checkHourlyRateLimit(maxSendsPerHour: number): Promise<SafetyVerdict> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const count = await prisma.outboundMessage.count({
    where: { createdAt: { gte: since }, status: { in: ['SENT', 'DRY_RUN'] } },
  });
  if (count >= maxSendsPerHour) {
    return deny('RATE_LIMIT', `Hourly limit of ${maxSendsPerHour} message(s) reached.`, true);
  }
  return ALLOW;
}

/** No follow-up before the configured quiet period has elapsed. */
export function checkFollowUpDelay(lastSentAt: Date | null, followUpDelayHours: number): SafetyVerdict {
  if (!lastSentAt) return ALLOW;
  const dueAt = new Date(lastSentAt.getTime() + followUpDelayHours * 60 * 60 * 1000);
  if (Date.now() < dueAt.getTime()) {
    return deny('FOLLOW_UP_TOO_SOON', `Follow-up not due until ${dueAt.toISOString()}.`, false);
  }
  return ALLOW;
}

/** A message needs somewhere to go. */
export function checkRecipient(
  lead: { instagramUsername?: string | null; email?: string | null; phone?: string | null },
  channel: string,
): SafetyVerdict {
  if (channel === 'EMAIL' && !lead.email) return deny('NO_CONTACT_DETAILS', 'No public email on file for this lead.', true);
  if (channel === 'WHATSAPP' && !lead.phone) return deny('NO_CONTACT_DETAILS', 'No public phone on file for this lead.', true);
  if (channel === 'INSTAGRAM_DM' && !lead.instagramUsername) {
    return deny('NO_CONTACT_DETAILS', 'No Instagram handle on file for this lead.', true);
  }
  return ALLOW;
}

/**
 * Deterministic pricing bounds. The agent may choose any value inside
 * [minPrice, maxNegotiation]. Outside that window it must ask a human.
 * The number itself is proposed by the AI; this function only validates it.
 */
export function checkPriceWithinLimits(
  price: number,
  rule: { minPrice: number; maxNegotiation: number; escalationAbove?: number | null } | null,
): SafetyVerdict {
  if (!rule) return deny('NO_PRICING_RULE', 'No active pricing rule configured for this service.', true);
  if (!Number.isFinite(price) || price <= 0) {
    return deny('INVALID_PRICE', 'Proposed price is not a positive number.', true);
  }
  if (price < rule.minPrice || price > rule.maxNegotiation) {
    return deny(
      'PRICE_OUT_OF_RANGE',
      `Price ${price} is outside the allowed range ${rule.minPrice}-${rule.maxNegotiation}.`,
      true,
    );
  }
  if (rule.escalationAbove != null && price > rule.escalationAbove) {
    return deny('PRICE_ESCALATION', `Price above ${rule.escalationAbove} requires owner approval.`, true);
  }
  return ALLOW;
}

/** Runs the full send gauntlet and returns the FIRST failing gate. */
export async function runSendSafetyGates(params: {
  lead: any;
  leadId: string;
  contentHash: string;
  channel: string;
  autoDm: boolean;
  providerConfigured: boolean;
  /** Optional live authorization result. Omitted = treated as unknown/not authorized. */
  providerAuthorized?: boolean;
  maxSendsPerHour: number;
  maxSendsPerLead: number;
}): Promise<SafetyVerdict> {
  if (!params.autoDm) {
    return deny('AUTO_DM_OFF', 'AUTO DM is OFF. Messages are drafted but never sent.', false);
  }

  const leadGate = checkLeadMessagingAllowed(params.lead);
  if (!leadGate.allowed) return leadGate;

  const recipientGate = checkRecipient(params.lead, params.channel);
  if (!recipientGate.allowed) return recipientGate;

  const duplicateGate = await checkDuplicateSend(params.leadId, params.contentHash);
  if (!duplicateGate.allowed) return duplicateGate;

  const capGate = await checkPerLeadCap(params.leadId, params.maxSendsPerLead);
  if (!capGate.allowed) return capGate;

  const rateGate = await checkHourlyRateLimit(params.maxSendsPerHour);
  if (!rateGate.allowed) return rateGate;

  if (!params.providerConfigured) {
    return deny(
      'MESSAGE_PROVIDER_NOT_CONFIGURED',
      'Messaging integration required — no authorized provider connected.',
      false,
    );
  }

  // The provider must have positively confirmed authorization. A configured-but-
  // unauthorized adapter (e.g. revoked token, missing permission) must not send.
  if (params.providerAuthorized === false) {
    return deny(
      'PROVIDER_NOT_AUTHORIZED',
      'Messaging provider is configured but has not confirmed authorization. Nothing was sent.',
      true,
    );
  }

  return ALLOW;
}


