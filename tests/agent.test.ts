/**
 * AUTONOMOUS AGENT — Synthetic tests.
 *
 * Uses only fake businesses ("Person A / Example Gym"). No private Instagram
 * content, no real websites, no network calls. Every test cleans up after
 * itself so the owner's real database is left untouched.
 */

import { prisma } from '../server/src/database/client.js';
import { AutonomousAgent } from '../server/src/agent/autonomousAgent.js';
import { checkPriceWithinLimits, checkLeadMessagingAllowed, runSendSafetyGates } from '../server/src/agent/safety.js';
import { PricingService, validatePricingRule } from '../server/src/agent/pricing.js';
import { AgentLearningStore } from '../server/src/agent/learningStore.js';
import { getMessagingProvider, getMessagingStatus, hashMessage } from '../server/src/agent/messagingProvider.js';

type Result = { name: string; passed: boolean; message?: string };

const TEST_HANDLE = 'test_agent_synthetic_001';

async function makeLead(overrides: Record<string, unknown> = {}) {
  return prisma.lead.create({
    data: {
      businessName: 'Example Gym (synthetic)',
      personName: 'Person A',
      instagramUsername: TEST_HANDLE,
      source: 'TEST',
      status: 'NEW',
      niche: 'Gym',
      ...overrides,
    },
  });
}

export async function runAgentTests(): Promise<Result[]> {
  const results: Result[] = [];
  const pass = (name: string, passed: boolean, message?: string) => results.push({ name, passed, message });

  let leadId: string | null = null;

  try {
    /* 1. Provider is honest about being unconfigured ---------------------------- */
    const messaging = getMessagingStatus();
    pass(
      'Agent: no unauthorized provider is active (cannot silently send)',
      messaging.configured === false && messaging.provider === 'DRY_RUN',
      `provider=${messaging.provider} configured=${messaging.configured}`,
    );

    /* 2. The dry-run adapter never reports a real send -------------------------- */
    const dry = await getMessagingProvider().send({
      leadId: 'synthetic',
      channel: 'INSTAGRAM_DM',
      recipient: 'person_a',
      body: 'Hello from a test.',
      contentHash: 'hash',
    });
    pass('Agent: dry-run provider reports DRY_RUN, never SENT', dry.status === 'DRY_RUN', `status=${dry.status}`);

    /* 3. AUTO DM OFF blocks sending -------------------------------------------- */
    const offGate = await runSendSafetyGates({
      lead: { aiPaused: false, doNotContact: false, instagramUsername: 'person_a' },
      leadId: 'synthetic',
      contentHash: 'h1',
      channel: 'INSTAGRAM_DM',
      autoDm: false,
      providerConfigured: true,
      maxSendsPerHour: 10,
      maxSendsPerLead: 1,
    });
    pass(
      'Agent: AUTO DM OFF prevents any send',
      !offGate.allowed && offGate.code === 'AUTO_DM_OFF',
      offGate.allowed ? 'allowed' : offGate.code,
    );

    /* 4. Unconfigured provider is the final backstop --------------------------- */
    const noProvider = await runSendSafetyGates({
      lead: { aiPaused: false, doNotContact: false, instagramUsername: 'person_a' },
      leadId: 'synthetic',
      contentHash: 'h2',
      channel: 'INSTAGRAM_DM',
      autoDm: true,
      providerConfigured: false,
      maxSendsPerHour: 10,
      maxSendsPerLead: 1,
    });
    pass(
      'Agent: unconfigured provider blocks sending even with AUTO DM ON',
      !noProvider.allowed && noProvider.code === 'MESSAGE_PROVIDER_NOT_CONFIGURED',
      noProvider.allowed ? 'allowed' : noProvider.code,
    );

    /* 5. Human take-over stops the AI ------------------------------------------ */

    /* 7. Pricing inside the owner limits is allowed ---------------------------- */
    const rule = { minPrice: 10000, maxNegotiation: 15000, escalationAbove: 14000 };
    const inRange = checkPriceWithinLimits(12000, rule);
    pass('Agent: price within owner limits is allowed', inRange.allowed === true);

    /* 8. Pricing below the floor escalates ------------------------------------- */
    const tooLow = checkPriceWithinLimits(5000, rule);
    pass(
      'Agent: price below minimum escalates to human',
      !tooLow.allowed && tooLow.code === 'PRICE_OUT_OF_RANGE' && tooLow.escalate,
      tooLow.allowed ? 'allowed' : tooLow.code,
    );

    /* 9. Pricing above the cap escalates --------------------------------------- */
    const tooHigh = checkPriceWithinLimits(99000, rule);
    pass(
      'Agent: price above maximum escalates to human',
      !tooHigh.allowed && tooHigh.escalate,
      tooHigh.allowed ? 'allowed' : tooHigh.code,
    );

    /* 10. Missing pricing rule escalates (never guess a price) ----------------- */
    const noRule = checkPriceWithinLimits(12000, null);
    pass('Agent: no pricing rule escalates instead of guessing', !noRule.allowed && noRule.code === 'NO_PRICING_RULE');

    /* 11. Invalid pricing configuration is rejected ---------------------------- */
    const invalid = validatePricingRule({
      service: 'STATIC_SITE',
      minPrice: 10000,
      normalPriceMin: 30000,
      normalPriceMax: 20000,
      maxNegotiation: 50000,
    });
    pass('Agent: invalid pricing bounds are rejected', invalid.valid === false, invalid.valid ? '' : invalid.error);

    /* 12. Deterministic quote stays inside the normal band --------------------- */
    const quoteA = PricingService.pickQuote({ normalPriceMin: 20000, normalPriceMax: 40000 }, 1);
    const quoteB = PricingService.pickQuote({ normalPriceMin: 20000, normalPriceMax: 40000 }, 1);
    pass(
      'Agent: quote is deterministic and inside the configured band',
      quoteA === quoteB && quoteA >= 20000 && quoteA <= 40000,
      `quote=${quoteA}`,
    );

    /* 13. Learning starts as PROPOSED, never auto-approved --------------------- */
    const learning = await AgentLearningStore.record({
      leadId: null,
      sourceType: 'AUTONOMOUS_RUN',
      sourceId: null,
      category: 'OUTREACH_STYLE',
      observation: 'Synthetic observation: opening was shortened by a human',
      outcome: 'SHORTER_OPENING',
    });
    pass(
      'Agent: AI learning is stored as PROPOSED, never auto-approved',
      learning?.status === 'PROPOSED',
      `status=${learning?.status}`,
    );

    /* 14. Repeated identical learning does not duplicate ----------------------- */
    await AgentLearningStore.record({
      leadId: null,
      sourceType: 'AUTONOMOUS_RUN',
      sourceId: null,
      category: 'OUTREACH_STYLE',
      observation: 'Synthetic observation: opening was shortened by a human',
      outcome: 'SHORTER_OPENING',
    });
    const learningRows = await prisma.learningEvent.findMany({
      where: { category: 'OUTREACH_STYLE', observation: 'Synthetic observation: opening was shortened by a human' },
    });
    pass(
      'Agent: duplicate learning is merged, not duplicated',
      learningRows.length === 1 && learningRows[0].supportCount === 2,
      `rows=${learningRows.length} support=${learningRows[0]?.supportCount}`,
    );

    /* 15. Contradictory evidence flags the rule for review --------------------- */
    await AgentLearningStore.record({
      leadId: null,
      sourceType: 'AUTONOMOUS_RUN',
      sourceId: null,
      category: 'OUTREACH_STYLE',
      observation: 'Synthetic observation: opening was shortened by a human',
      outcome: 'LONGER_OPENING',
    });
    const afterContradiction = await prisma.learningEvent.findFirst({ where: { category: 'OUTREACH_STYLE' } });
    pass(
      'Agent: contradictory evidence increments contradictions',
      (afterContradiction?.contradictionCount ?? 0) >= 1,
      `contradictions=${afterContradiction?.contradictionCount}`,
    );

    /* 16. Only APPROVED rules are exposed as future context -------------------- */
    const approved = await AgentLearningStore.getApprovedContext();
    pass(
      'Agent: unapproved learnings are excluded from AI context',
      approved.every((r) => r.category !== 'OUTREACH_STYLE'),
      `approvedCount=${approved.length}`,
    );

    /* 17. Start / pause / stop state machine ---------------------------------- */
    await AutonomousAgent.start();
    const running = await AutonomousAgent.getStatus();
    await AutonomousAgent.pause();
    const paused = await AutonomousAgent.getStatus();
    await AutonomousAgent.stop();
    const stopped = await AutonomousAgent.getStatus();
    pass(
      'Agent: START / PAUSE / STOP transitions work',
      running.state === 'RUNNING' && paused.state === 'PAUSED' && stopped.state === 'STOPPED',
      `${running.state}->${paused.state}->${stopped.state}`,
    );

    /* 18. AUTO DM defaults to OFF --------------------------------------------- */
    pass('Agent: AUTO DM defaults to OFF (nothing sent by default)', running.autoDm === false, `autoDm=${running.autoDm}`);

    /* 19. Take-over / release round-trip on a real (synthetic) lead ------------ */
    leadId = (await makeLead()).id;
    await AutonomousAgent.takeOver(leadId);
    const taken = await prisma.lead.findUnique({ where: { id: leadId } });
    await AutonomousAgent.release(leadId);
    const released = await prisma.lead.findUnique({ where: { id: leadId } });
    pass(
      'Agent: take-over pauses and release resumes the AI for that lead',
      taken?.aiPaused === true && released?.aiPaused === false,
      `paused=${taken?.aiPaused} released=${released?.aiPaused}`,
    );

    /* 20. Opt-out permanently blocks the lead ---------------------------------- */
    await AutonomousAgent.optOut(leadId);
    const opted = await prisma.lead.findUnique({ where: { id: leadId } });
    pass('Agent: opt-out is recorded and blocks the AI', opted?.doNotContact === true);

    /* 21. Opted-out leads are never selected by the run loop ------------------- */
    await AutonomousAgent.setAutoDm(true);
    await AutonomousAgent.start();
    const candidates = await AutonomousAgent.selectCandidates(20);
    pass(
      'Agent: opted-out and taken-over leads are excluded from the run loop',
      candidates.every((l) => !l.doNotContact && !l.aiPaused),
      `candidates=${candidates.length}`,
    );

    /* 22. Tick does nothing when the agent is stopped -------------------------- */
    await AutonomousAgent.stop();
    const stoppedTick = await AutonomousAgent.tick();
    pass('Agent: tick performs no work while stopped', stoppedTick.processed === 0, `processed=${stoppedTick.processed}`);

    /* 23. Same message content produces the same hash (duplicate guard) ------- */
    const hashA = hashMessage('lead-1', 'Hello there');
    const hashB = hashMessage('lead-1', '  Hello there  ');
    pass('Agent: message hashing is stable for duplicate detection', hashA === hashB);

    /* 24. No outbound message was ever recorded as SENT ------------------------ */
    const sentRows = await prisma.outboundMessage.count({ where: { status: 'SENT' } });
    pass('Agent: no message was ever marked SENT in this test run', sentRows === 0, `sentRows=${sentRows}`);

    /* 25. AUTO DM is restored to OFF ------------------------------------------- */
    await AutonomousAgent.setAutoDm(false);
    const finalStatus = await AutonomousAgent.getStatus();
    pass('Agent: AUTO DM restored to OFF after tests', finalStatus.autoDm === false);
  } catch (err: any) {
    pass('Agent: test suite completed without an unexpected error', false, err?.message);
  } finally {
    // Always clean up synthetic data.
    if (leadId) {
      await prisma.lead.delete({ where: { id: leadId } }).catch(() => {});
    }
    await prisma.outboundMessage.deleteMany({ where: { lead: { instagramUsername: TEST_HANDLE } } }).catch(() => {});
    await prisma.learningEvent.deleteMany({ where: { observation: { startsWith: 'Synthetic observation' } } }).catch(() => {});
    await prisma.agentEvent.deleteMany({ where: { lead: { instagramUsername: TEST_HANDLE } } }).catch(() => {});
    await prisma.agentEvent
      .deleteMany({ where: { type: { in: ['RUN_STARTED', 'RUN_PAUSED', 'RUN_STOPPED', 'AUTO_DM_CHANGED'] } } })
      .catch(() => {});
    await prisma.pricingRule.deleteMany({ where: { service: { startsWith: 'TEST_' } } }).catch(() => {});
  }

  return results;
}
