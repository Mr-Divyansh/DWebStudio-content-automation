import { runImporterTests } from './importer.test.js';
import { runAnalyzerTests } from './analyzer.test.js';
import { runDatabaseTests } from './database.test.js';
import { runHtmlImporterTests } from './htmlImporter.test.js';
import { runResearchTests } from './research.test.js';
import { prisma } from '../server/src/database/client.js';

async function main() {
  console.log('====================================================');
  console.log('  D WEB STUDIO LEAD AI — AUTOMATED TEST SUITE');
  console.log('====================================================\n');

  let totalPassed = 0;
  let totalFailed = 0;

  console.log('--- 1. IMPORTER & PARSER TESTS ---');
  const importerResults = await runImporterTests();
  for (const r of importerResults) {
    if (r.passed) {
      console.log(`  [PASS] ${r.name}`);
      if (r.message) console.log(`         -> ${r.message}`);
      totalPassed++;
    } else {
      console.log(`  [FAIL] ${r.name}`);
      if (r.message) console.log(`         -> ERROR: ${r.message}`);
      totalFailed++;
    }
  }

  console.log('\n--- 2. AI ANALYZER & NO-INVENTION RULE TESTS ---');
  const analyzerResults = await runAnalyzerTests();
  for (const r of analyzerResults) {
    if (r.passed) {
      console.log(`  [PASS] ${r.name}`);
      if (r.message) console.log(`         -> ${r.message}`);
      totalPassed++;
    } else {
      console.log(`  [FAIL] ${r.name}`);
      if (r.message) console.log(`         -> ERROR: ${r.message}`);
      totalFailed++;
    }
  }

  console.log('\n--- 3. PRISMA DATABASE, DEDUPLICATION & USER CORRECTIONS ---');
  const dbResults = await runDatabaseTests();
  for (const r of dbResults) {
    if (r.passed) {
      console.log(`  [PASS] ${r.name}`);
      if (r.message) console.log(`         -> ${r.message}`);
      totalPassed++;
    } else {
      console.log(`  [FAIL] ${r.name}`);
      if (r.message) console.log(`         -> ERROR: ${r.message}`);
      totalFailed++;
    }
  }

  console.log('\n--- 4. INSTAGRAM HTML CONVERSATION READER ---');
  const htmlResults = await runHtmlImporterTests();
  for (const r of htmlResults) {
    if (r.passed) {
      console.log(`  [PASS] ${r.name}`);
      if (r.message) console.log(`         -> ${r.message}`);
      totalPassed++;
    } else {
      console.log(`  [FAIL] ${r.name}`);
      if (r.message) console.log(`         -> ERROR: ${r.message}`);
      totalFailed++;
    }
  }

  console.log('\n--- 5. PUBLIC RESEARCH PIPELINE (SAFE HTTP, WEBSITE AUDIT, EVIDENCE) ---');
  const researchResults = await runResearchTests();
  for (const r of researchResults) {
    if (r.passed) {
      console.log(`  [PASS] ${r.name}`);
      if (r.message) console.log(`         -> ${r.message}`);
      totalPassed++;
    } else {
      console.log(`  [FAIL] ${r.name}`);
      if (r.message) console.log(`         -> ERROR: ${r.message}`);
      totalFailed++;
    }
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${totalPassed} Passed, ${totalFailed} Failed.`);
  console.log('====================================================\n');

  await prisma.$disconnect();

  if (totalFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
