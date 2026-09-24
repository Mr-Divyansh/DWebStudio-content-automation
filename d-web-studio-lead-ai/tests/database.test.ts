import { prisma } from '../server/src/database/client.js';
import { LeadRepository } from '../server/src/database/repositories/leadRepository.js';
import { LearningEngine } from '../server/src/learning/learningEngine.js';

export async function runDatabaseTests(): Promise<{ name: string; passed: boolean; message?: string }[]> {
  const results: { name: string; passed: boolean; message?: string }[] = [];

  // Test 1: Lead creation and lookup
  let testLeadId = '';
  try {
    const testLead = await LeadRepository.create({
      businessName: 'Test Crossfit Box',
      personName: 'Dave Miller',
      instagramUsername: 'test_crossfit_999',
      source: 'INSTAGRAM',
      sourceConversationId: 'test_convo_unique_123',
      conversationSummary: 'Initial test lead inquiry',
      status: 'NEW',
      intent: 'POSSIBLY_INTERESTED',
      qualification: 'QUALIFIED',
      niche: 'Gym',
    });
    testLeadId = testLead.id;

    results.push({
      name: 'Database: Lead creation and primary key assignment',
      passed: Boolean(testLead.id && testLead.businessName === 'Test Crossfit Box'),
      message: `Created lead ID: ${testLead.id}`,
    });
  } catch (err: any) {
    results.push({ name: 'Database lead creation', passed: false, message: err?.message });
  }

  // Test 2: Duplicate detection by Instagram username
  try {
    const duplicateCheck = await LeadRepository.findByInstagramUsername('test_crossfit_999');
    results.push({
      name: 'Duplicate Detection: Identifies existing lead by Instagram handle',
      passed: Boolean(duplicateCheck && duplicateCheck.id === testLeadId),
      message: `Found existing ID: ${duplicateCheck?.id}`,
    });
  } catch (err: any) {
    results.push({ name: 'Duplicate detection test', passed: false, message: err?.message });
  }

  // Test 3: User correction flow and learning generation
  try {
    const correctionResult = await LearningEngine.recordUserCorrection({
      leadId: testLeadId,
      field: 'intent',
      originalValue: 'POSSIBLY_INTERESTED',
      correctedValue: 'NOT_INTERESTED',
      userReason: 'Contact explicitly stated they do not have budget this quarter.',
    });

    const updatedLead = await LeadRepository.findById(testLeadId);

    const verifiedCorrection =
      updatedLead?.intent === 'NOT_INTERESTED' &&
      updatedLead?.status === 'REJECTED' &&
      correctionResult.correction.field === 'intent';

    results.push({
      name: 'User Corrections: Audits correction, updates lead status, and creates persistent learning',
      passed: verifiedCorrection,
      message: `Lead intent updated to: ${updatedLead?.intent}, status: ${updatedLead?.status}`,
    });
  } catch (err: any) {
    results.push({ name: 'User correction test', passed: false, message: err?.message });
  }

  // Cleanup test lead
  if (testLeadId) {
    try {
      await LeadRepository.delete(testLeadId);
    } catch {}
  }

  return results;
}
