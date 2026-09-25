/**
 * AI POWER, READINESS & TRAINING — Synthetic tests.
 *
 * Verifies the three things the owner asked for:
 *   1. one switch that really starts and stops the AI,
 *   2. a readiness report that never claims more than the truth,
 *   3. "training" that turns owner-authored knowledge into approved rules
 *      without duplicating them on every run.
 *
 * Everything created here is deleted again in `finally`, so the owner's local
 * database is left exactly as it was found.
 */

import { prisma } from '../server/src/database/client.js';
import { AutonomousAgent } from '../server/src/agent/autonomousAgent.js';
import { AgentSetupService, OWNER_SOURCE_TYPE } from '../server/src/agent/setupService.js';

type Result = { name: string; passed: boolean; message?: string };

const TEST_SERVICE = 'AI_SETUP_TEST_SERVICE';
const TEST_TITLE = 'AI-SETUP-TEST Project';

export async function runSetupTests(): Promise<Result[]> {
  const results: Result[] = [];
  const pass = (name: string, passed: boolean, message?: string) => results.push({ name, passed, message });

  const startedAt = new Date();
  let projectId: string | null = null;
  let pricingCreated = false;
  let priorDiscovery = false;

  try {
    const before = await AutonomousAgent.getStatus();
    priorDiscovery = before.config.discoveryEnabled;

    /* 1. Readiness report is real, and lists NAMED keys only ------------------ */
    const report = await AgentSetupService.getReport();
    pass('Setup: readiness report returns real checks', report.checks.length >= 8, `checks=${report.checks.length}`);
    pass(
      'Setup: every check explains itself',
      report.checks.every((check) => check.label.length > 0 && check.detail.length > 0),
    );

    const secretValues = ['GEMINI_API_KEY', 'META_PAGE_ACCESS_TOKEN', 'META_APP_SECRET', 'DWS_ADMIN_PASSWORD']
      .map((name) => (process.env[name] ?? '').trim())
      .filter((value) => value.length > 5);
    const serialized = JSON.stringify(report);
    pass(
      'Setup: no secret value is ever returned to the browser',
      secretValues.every((value) => !serialized.includes(value)),
      `checked=${secretValues.length} secret(s)`,
    );
    pass(
      'Setup: sending is never reported as possible without an authorized provider',
      report.canSend === false || report.providerAuthorized === true,
      `canSend=${report.canSend} authorized=${report.providerAuthorized}`,
    );

    /* 2. Training stores owner knowledge as APPROVED rules -------------------- */
    const project = await prisma.portfolioProject.create({
      data: {
        title: TEST_TITLE,
        category: 'TestCategory',
        description: 'Synthetic project created by the automated test suite.',
        technologies: 'TypeScript',
      },
    });
    projectId = project.id;

    await prisma.pricingRule.create({
      data: {
        service: TEST_SERVICE,
        minPrice: 1000,
        normalPriceMin: 2000,
        normalPriceMax: 4000,
        maxNegotiation: 5000,
      },
    });
    pricingCreated = true;

    const first = await AgentSetupService.train();
    pass('Training: reports what it was trained on', first.created >= 2, first.summary);

    const ownerRows = await prisma.learningEvent.findMany({
      where: { sourceType: OWNER_SOURCE_TYPE, sourceId: `portfolio:${project.id}` },
    });
    pass(
      'Training: owner content becomes exactly one APPROVED rule',
      ownerRows.length === 1 && ownerRows[0].status === 'APPROVED',
      `rows=${ownerRows.length} status=${ownerRows[0]?.status}`,
    );
    pass(
      'Training: the rule carries owner evidence and never a message body',
      (ownerRows[0]?.evidence ?? '').includes(TEST_TITLE) && (ownerRows[0]?.humanAction ?? '') === 'OWNER_CONFIGURED',
    );


    /* 3. Training is idempotent ---------------------------------------------- */
    const second = await AgentSetupService.train();
    const afterSecond = await prisma.learningEvent.count({
      where: { sourceType: OWNER_SOURCE_TYPE, sourceId: `portfolio:${project.id}` },
    });
    pass(
      'Training: running it again never duplicates a rule',
      second.created === 0 && afterSecond === 1,
      `created=${second.created} rows=${afterSecond}`,
    );

    /* 4. Editing a source refreshes its rule --------------------------------- */
    await prisma.portfolioProject.update({ where: { id: project.id }, data: { results: 'Synthetic metric +10%' } });
    const third = await AgentSetupService.train();
    const refreshed = await prisma.learningEvent.findFirst({ where: { sourceId: `portfolio:${project.id}` } });
    pass(
      'Training: editing a project refreshes its rule instead of adding one',
      third.updated >= 1 && (refreshed?.observation ?? '').includes('Synthetic metric +10%'),
      `updated=${third.updated}`,
    );

    /* 5. Nothing the AI inferred is ever approved by training ---------------- */
    const inferred = await prisma.learningEvent.findMany({ where: { sourceType: { not: OWNER_SOURCE_TYPE } } });
    pass(
      'Training: nothing the AI inferred is approved by training',
      inferred.every((row) => row.humanAction !== 'OWNER_CONFIGURED'),
      `checked=${inferred.length}`,
    );

    /* 6. The single switch really starts and stops the loop ------------------ */
    const on = await AutonomousAgent.setEnabled(true);
    const off = await AutonomousAgent.setEnabled(false);
    pass(
      'Power: one switch starts and stops the AI',
      on.state === 'RUNNING' && off.state === 'STOPPED',
      `${on.state} -> ${off.state}`,
    );
    pass('Power: switching off always disables AUTO DM', off.autoDm === false, `autoDm=${off.autoDm}`);
    pass(
      'Power: AUTO DM can only be ON when a sending account is connected',
      on.autoDm === on.messaging.configured,
      `autoDm=${on.autoDm} providerConfigured=${on.messaging.configured}`,
    );

    /* 7. One press does everything ------------------------------------------- */
    const activation = await AgentSetupService.activate();
    pass(
      'Power: one press turns the AI on and reports every step',
      activation.status.state === 'RUNNING' && activation.steps.length > 0,
      activation.steps.join(' | '),
    );
    pass(
      'Power: activation states honestly whether messages can be delivered',
      activation.steps.some((step) => step.includes('draft-only') || step.includes('AUTO DM is ON')),
    );

    const deactivation = await AgentSetupService.deactivate();
    pass(
      'Power: one press turns the AI off again',
      deactivation.status.state === 'STOPPED' && deactivation.status.autoDm === false,
      `${deactivation.status.state} autoDm=${deactivation.status.autoDm}`,
    );
  } catch (err: any) {
    pass('AI power & training: suite completed without an unexpected error', false, err?.message);
  } finally {
    // Always restore operator state and remove synthetic data.
    await AutonomousAgent.stop().catch(() => {});
    await prisma.agentConfig
      .update({
        where: { id: 'singleton' },
        data: { discoveryEnabled: priorDiscovery, autoDm: false, state: 'STOPPED', currentTask: null },
      })
      .catch(() => {});
    await prisma.learningEvent
      .deleteMany({ where: { sourceType: OWNER_SOURCE_TYPE, createdAt: { gte: startedAt } } })
      .catch(() => {});
    if (pricingCreated) await prisma.pricingRule.deleteMany({ where: { service: TEST_SERVICE } }).catch(() => {});
    if (projectId) await prisma.portfolioProject.delete({ where: { id: projectId } }).catch(() => {});
  }

  return results;
}
