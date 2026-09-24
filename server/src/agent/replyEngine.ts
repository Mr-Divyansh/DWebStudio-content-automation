/**
 * AUTONOMOUS AGENT â€” Inbound Reply Engine
 * ============================================================================
 * Turns an official provider webhook into a decided, logged action:
 *
 *   webhook -> resolve lead by IGSID -> idempotency check -> store -> analyze
 *           -> decide (REPLY / ESCALATE / IGNORE) -> safety gates -> send -> log
 *
 * Hard rules:
 *  - Our own echoed messages are never treated as a reply (infinite loop guard).
 *  - A redelivered webhook (same providerMessageId) is a no-op.
 *  - Opt-out and human take-over ALWAYS win over autonomous replying.
 *  - Provider errors escalate to a human instead of retrying forever.
 */

import { prisma } from '../database/client.js';
import { getMessagingProvider, hashMessage } from './messagingProvider.js';
import { InboundMessageEvent } from './instagramWebhook.js';
import { runSendSafetyGates, checkLeadMessagingAllowed } from './safety.js';
import { AgentLearningStore } from './learningStore.js';

export type ReplyDecision =
  | 'REPLY'
  | 'ESCALATE'
  | 'IGNORE_ECHO'
  | 'DUPLICATE'
  | 'OPT_OUT'
  | 'HUMAN_TAKEOVER'
  | 'NOT_TRACKED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_ERROR';

export interface InboundProcessResult {
  decision: ReplyDecision;
  leadId: string | null;
  providerMessageId: string;
  reason: string;
  sentStatus?: string;
  providerRef?: string | null;
  escalated?: boolean;
}

const OPT_OUT_PATTERNS = [
  /\bunsubscribe\b/i,
  /\bstop (?:messaging|contacting)\b/i,
  /\bdo not (?:contact|message|reach out)\b/i,
  /\bplease (?:do not|don'?t) (?:contact|message|email|call)\b/i,
  /\bleave me alone\b/i,
];

const OWNER_REQUEST_PATTERNS = [
  /\b(?:speak|talk) (?:to|with) (?:the )?(?:owner|founder|boss|proprietor)\b/i,
  /\b(?:owner|founder) (?:personally|directly)\b/i,
];

const ESCALATION_PATTERNS = [
  /\b(?:contract|agreement|nda|legal|lawyer|attorney)\b/i,
  /\b(?:payment|invoice|upi|refund|advance payment|bank transfer)\b/i,
  /\b(?:custom|unusual|bespoke) (?:requirement|project|feature)\b/i,
  /\b(?:mobile )?app\b/i,
];

/** Deterministic classification, applied before any AI call. */
export function classifyInbound(text: string): {
  optOut: boolean;
  wantsOwner: boolean;
  escalation: string | null;
} {
  if (OPT_OUT_PATTERNS.some((p) => p.test(text))) {
    return { optOut: true, wantsOwner: false, escalation: null };
  }
  if (OWNER_REQUEST_PATTERNS.some((p) => p.test(text))) {
    return { optOut: false, wantsOwner: true, escalation: 'Lead explicitly asked to speak with the owner.' };
  }
  for (const pattern of ESCALATION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        optOut: false,
        wantsOwner: false,
        escalation: 'Reply mentions a topic outside autonomous handling (legal, payment, custom scope or app).',
      };
    }
  }
  return { optOut: false, wantsOwner: false, escalation: null };
}

async function logEvent(input: {
  type: string;
  message: string;
  status?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'HUMAN_REQUIRED';
  leadId?: string | null;
  details?: Record<string, unknown>;
}) {
  await prisma.agentEvent.create({
    data: {
      type: input.type,
      message: input.message,
      status: input.status ?? 'INFO',
      leadId: input.leadId ?? null,
      details: input.details ? JSON.stringify(input.details) : null,
    },
  });
}

/** Finds the lead that owns this IGSID. */
export async function resolveLeadByIgSid(igSid: string): Promise<string | null> {
  const existing = await prisma.lead.findFirst({ where: { instagramScopedId: igSid }, select: { id: true } });
  return existing?.id ?? null;
}

/**
 * Handles ONE inbound event. Exported so it can be unit tested without a server.
 */
export async function processInboundMessage(event: InboundMessageEvent): Promise<InboundProcessResult> {
  const base = { providerMessageId: event.providerMessageId };

  /* 1. Never answer our own message. */
  if (event.isEcho) {
    return { ...base, decision: 'IGNORE_ECHO', leadId: null, reason: 'Message was an echo of our own outbound message.' };
  }

  /* 2. Idempotency: a redelivered webhook must not act twice. */
  const already = await prisma.inboundMessage.findUnique({ where: { providerMessageId: event.providerMessageId } });
  if (already) {
    return {
      ...base,
      decision: 'DUPLICATE',
      leadId: already.leadId,
      reason: 'Webhook already processed for this message id.',
    };
  }

  /* 3. Resolve the lead and persist the inbound message. */
  const leadId = await resolveLeadByIgSid(event.senderIgSid);
  await prisma.inboundMessage.create({
    data: {
      providerMessageId: event.providerMessageId,
      senderIgSid: event.senderIgSid,
      body: event.text,
      leadId,
      deliveryStatus: 'RECEIVED',
      humanTakeover: false,
    },
  });

  if (!leadId) {
    await logEvent({
      type: 'INBOUND_UNTRACKED',
      message: 'Inbound message received from an unknown sender. No reply sent.',
      status: 'WARNING',
      details: { hasText: Boolean(event.text) },
    });
    return { ...base, decision: 'NOT_TRACKED', leadId: null, reason: 'No lead is linked to this Instagram-scoped ID.' };
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ...base, decision: 'NOT_TRACKED', leadId, reason: 'Lead record no longer exists.' };

  const text = event.text || '';
  const classified = classifyInbound(text);

  /* 4. Opt-out always wins and is recorded permanently. */
  if (classified.optOut) {
    await prisma.lead.update({
      where: { id: leadId },
      data: { doNotContact: true, optOutAt: new Date(), aiPaused: true, status: 'NOT_INTERESTED' },
    });
    await prisma.inboundMessage.updateMany({
      where: { providerMessageId: event.providerMessageId },
      data: { humanTakeover: true },
    });
    await logEvent({
      type: 'OPT_OUT_DETECTED',
      message: 'Opt-out detected in an inbound reply. AI contact permanently disabled for this lead.',
      status: 'HUMAN_REQUIRED',
      leadId,
    });
    return { ...base, decision: 'OPT_OUT', leadId, reason: 'Lead requested to stop being contacted.' };
  }

  /* 5. Human take-over: store it, never auto-reply. */
  const takeover = checkLeadMessagingAllowed(lead);
  if (!takeover.allowed && takeover.code === 'HUMAN_TAKEOVER') {
    await prisma.inboundMessage.updateMany({
      where: { providerMessageId: event.providerMessageId },
      data: { humanTakeover: true },
    });
    await logEvent({
      type: 'INBOUND_WHILE_TAKEOVER',
      message: 'Reply received while a human has taken over. AI did not respond.',
      status: 'WARNING',
      leadId,
    });
    return { ...base, decision: 'HUMAN_TAKEOVER', leadId, reason: 'A human is handling this conversation.' };
  }

  /* 6. Escalation triggers go to a human with no autonomous reply. */
  if (classified.escalation) {
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: 'HUMAN_REQUIRED', suggestedNextAction: classified.escalation },
    });
    await logEvent({ type: 'ESCALATION_REQUIRED', message: classified.escalation, status: 'HUMAN_REQUIRED', leadId });
    await AgentLearningStore.record({
      leadId,
      sourceType: 'REPLY_ANALYSIS',
      sourceId: event.providerMessageId,
      category: 'REPLY_ANALYSIS',
      observation: 'Inbound reply required human escalation',
      outcome: 'ESCALATED',
    });
    return { ...base, decision: 'ESCALATE', leadId, reason: classified.escalation, escalated: true };
  }

  const provider = getMessagingProvider();
  if (!provider.isConfigured) {
    await logEvent({
      type: 'REPLY_PROVIDER_UNAVAILABLE',
      message: 'Inbound reply received but messaging is not configured. Reply not sent.',
      status: 'WARNING',
      leadId,
    });
    await prisma.lead.update({ where: { id: leadId }, data: { status: 'AI_CONVERSATION' } });
    return {
      ...base,
      decision: 'PROVIDER_UNAVAILABLE',
      leadId,
      reason: 'No authorized messaging provider is configured.',
    };
  }

  const auth = provider.checkAuthorization
    ? await provider.checkAuthorization()
    : { authorized: false, reason: 'Adapter cannot verify authorization.' };
  if (!auth.authorized) {
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: 'HUMAN_REQUIRED', suggestedNextAction: `Messaging provider error: ${auth.reason}` },
    });
    await logEvent({
      type: 'REPLY_PROVIDER_ERROR',
      message: `Messaging provider authorization failed: ${auth.reason}`,
      status: 'HUMAN_REQUIRED',
      leadId,
    });
    return { ...base, decision: 'PROVIDER_ERROR', leadId, reason: auth.reason, escalated: true };
  }

  /* 8. Compose the reply. */
  const replyText = await composeReply(text);
  if (!replyText) {
    await prisma.lead.update({ where: { id: leadId }, data: { status: 'HUMAN_REQUIRED' } });
    await logEvent({
      type: 'REPLY_NOT_COMPOSED',
      message: 'No reply could be composed from verified information. Awaiting human input.',
      status: 'HUMAN_REQUIRED',
      leadId,
    });
    return { ...base, decision: 'ESCALATE', leadId, reason: 'AI could not safely determine a reply.', escalated: true };
  }

  /* 9. Full safety gauntlet before sending. */
  const contentHash = hashMessage(leadId, replyText);
  const verdict = await runSendSafetyGates({
    lead,
    leadId,
    contentHash,
    channel: 'INSTAGRAM_DM',
    autoDm: true,
    providerConfigured: true,
    providerAuthorized: true,
    maxSendsPerHour: 1000,
    maxSendsPerLead: 1000,
  });

  if (!verdict.allowed) {
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: verdict.escalate ? 'HUMAN_REQUIRED' : 'AI_CONVERSATION' },
    });
    await logEvent({
      type: 'REPLY_BLOCKED',
      message: `Reply not sent: ${verdict.reason}`,
      status: verdict.escalate ? 'HUMAN_REQUIRED' : 'WARNING',
      leadId,
      details: { code: verdict.code },
    });
    return { ...base, decision: 'ESCALATE', leadId, reason: verdict.reason, escalated: verdict.escalate };
  }

  /* 10. Send and log the true outcome. */
  const result = await provider.send({
    leadId,
    channel: 'INSTAGRAM_DM',
    recipient: lead.instagramScopedId,
    body: replyText,
    contentHash,
  });

  await prisma.outboundMessage.create({
    data: {
      leadId,
      channel: 'INSTAGRAM_DM',
      recipient: lead.instagramScopedId,
      body: replyText,
      contentHash,
      status: result.status,
      provider: result.provider,
      providerRef: result.providerRef ?? null,
      error: result.error ?? null,
    },
  });

  if (result.status === 'SENT') {
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: 'AI_CONVERSATION', lastAgentActionAt: new Date() },
    });
    await logEvent({ type: 'REPLY_SENT', message: `Reply delivered via ${result.provider}.`, status: 'SUCCESS', leadId });
    return {
      ...base,
      decision: 'REPLY',
      leadId,
      reason: result.detail,
      sentStatus: result.status,
      providerRef: result.providerRef ?? null,
    };
  }

  if (result.status === 'FAILED') {
    await prisma.lead.update({ where: { id: leadId }, data: { status: 'HUMAN_REQUIRED', suggestedNextAction: result.detail } });
    await logEvent({ type: 'REPLY_FAILED', message: result.detail, status: 'ERROR', leadId });
    return { ...base, decision: 'PROVIDER_ERROR', leadId, reason: result.detail, escalated: true };
  }

  await prisma.lead.update({ where: { id: leadId }, data: { status: 'AI_CONVERSATION' } });
  await logEvent({ type: 'REPLY_DRY_RUN', message: result.detail, status: 'WARNING', leadId });
  return { ...base, decision: 'REPLY', leadId, reason: result.detail, sentStatus: result.status, providerRef: result.providerRef ?? null };
}

/**
 * Composes a short, evidence-grounded reply.
 *
 * It deliberately does NOT invent prices, timelines or capabilities. A price is
 * quoted only from the owner's configured PricingRule; if that rule cannot be
 * honoured the function returns null so the lead escalates to a human.
 */
async function composeReply(inboundText: string): Promise<string | null> {
  // A price question is answered ONLY from the owner's configured rule.
  if (/\b(price|cost|quote|charges?|rate|budget|how much)\b/i.test(inboundText)) {
    const rules = await prisma.pricingRule.findMany({ where: { active: true }, take: 1 });
    const rule = rules[0];
    if (!rule) return null;
    const quote = rule.normalPriceMin;
    if (!isWithinOwnerLimits(quote, rule)) return null;
    return `Thanks for asking. Our standard range for this kind of work starts at ${rule.currency} ${quote}. If that works for you, I can share a short outline of what is included.`;
  }

  if (/\b(not interested|no thanks|not now|not right now)\b/i.test(inboundText)) {
    return 'Understood â€” thanks for letting me know. I will not follow up further.';
  }

  if (/\b(yes|interested|sounds good|send (?:it|details)|tell me more)\b/i.test(inboundText)) {
    return 'Great to hear. I can share a short outline of the work and a relevant example. Would you like me to send it over?';
  }

  // Anything else: acknowledge without claiming to know their requirements.
  return 'Thanks for your message. To make sure I point you to the right thing, could you tell me a little more about what you are looking for?';
}

/** Local, non-throwing bounds check against the owner's configured rule. */
function isWithinOwnerLimits(price: number, rule: any): boolean {
  if (!Number.isFinite(price) || price <= 0) return false;
  if (price < rule.minPrice || price > rule.maxNegotiation) return false;
  if (rule.escalationAbove != null && price > rule.escalationAbove) return false;
  return true;
}
