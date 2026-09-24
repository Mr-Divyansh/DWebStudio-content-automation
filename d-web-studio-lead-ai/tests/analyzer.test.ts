import {
  ConversationAnalysisSchema,
  OutreachDraftSchema,
  LearningExtractionSchema,
} from '../server/src/ai/schemas/leadSchemas.js';
import { ConversationAnalyzer } from '../server/src/ai/analyzer.js';

export async function runAnalyzerTests(): Promise<{ name: string; passed: boolean; message?: string }[]> {
  const results: { name: string; passed: boolean; message?: string }[] = [];

  // Test 1: ConversationAnalysisSchema validation with valid structured object
  try {
    const validData = {
      businessInfo: {
        businessName: 'Solstice Yoga Studio',
        personName: 'Maya Patel',
        instagramUsername: 'solstice_yoga',
        phone: null,
        email: null,
        location: 'Denver, CO',
        website: 'https://solsticeyoga.example.com',
        niche: 'Gym',
      },
      conversationSummary: 'Maya asked for pricing on a booking system website.',
      intent: 'INTERESTED',
      intentReason: 'Contact explicitly asked for pricing on a Mindbody integrated redesign.',
      intentConfidence: 'HIGH',
      qualification: 'QUALIFIED',
      qualificationReason: 'Verified local yoga studio with clear requirement and booking pain point.',
      offerDiscussed: 'Flagship Web Redesign',
      priceDiscussed: null,
      objections: ['Timeline is tight'],
      importantMessages: ['Do you have availability to build this by next month?'],
      followUpNeeded: true,
      followUpReason: 'Send proposal overview and availability',
      portfolioCategory: 'Gym',
      portfolioMatchReason: 'Matches fitness and wellness studio portfolio',
      suggestedNextAction: 'Send Apex Strength Club case study',
      evidenceList: [
        {
          claim: 'Interested in booking redesign',
          evidence: 'Do you have availability to build this by next month?',
          source: 'Instagram DM',
          confidence: 'high',
        },
      ],
    };

    const parsed = ConversationAnalysisSchema.safeParse(validData);
    results.push({
      name: 'AI Schema: Validates complete lead conversation analysis output',
      passed: parsed.success,
      message: parsed.success ? 'Schema valid' : JSON.stringify(parsed.error?.format()),
    });
  } catch (err: any) {
    results.push({ name: 'AI Schema validation exception', passed: false, message: err?.message });
  }

  // Test 2: Intent classification boundary — Greetings like "Hi" must not classify as INTERESTED
  try {
    const { analysis } = await ConversationAnalyzer.analyzeConversation({
      conversationText: 'Client: Hi\nD Web Studio: Hello! How can we help?\nClient: Thanks',
      source: 'INSTAGRAM',
      externalId: 'test_greeting_convo',
    });

    const isNotInterested = analysis.intent !== 'INTERESTED';
    results.push({
      name: 'No-Invention Rule: Casual greeting "Hi" / "Thanks" does NOT classify as buying INTERESTED',
      passed: isNotInterested,
      message: `Classified as: ${analysis.intent} (Reason: ${analysis.intentReason})`,
    });
  } catch (err: any) {
    results.push({ name: 'Greeting classification test', passed: false, message: err?.message });
  }

  // Test 3: Rejection detection
  try {
    const { analysis } = await ConversationAnalyzer.analyzeConversation({
      conversationText: 'Client: We are not interested, stop messaging us.\nClient: We already hired another agency.',
      source: 'INSTAGRAM',
      externalId: 'test_rejection_convo',
    });

    results.push({
      name: 'Objection / Rejection: Correctly identifies NOT_INTERESTED and DISQUALIFIED',
      passed: analysis.intent === 'NOT_INTERESTED' && analysis.qualification === 'DISQUALIFIED',
      message: `Intent: ${analysis.intent}, Qualification: ${analysis.qualification}`,
    });
  } catch (err: any) {
    results.push({ name: 'Rejection detection test', passed: false, message: err?.message });
  }

  // Test 4: OutreachDraftSchema validation
  try {
    const validDraft = {
      channel: 'INSTAGRAM_DM',
      messageBody: 'Hey Maya! Loved seeing your studio community. We recently built Apex Strength Club with seamless class booking: https://apexstrength.example.com — let me know if you would like a quick video breakdown for Solstice!',
      personalizationReason: 'References her studio name and matches Gym portfolio project.',
      evidenceUsed: ['Lead operates Solstice Yoga Studio', 'Needs class booking'],
      confidence: 'HIGH',
    };

    const parsed = OutreachDraftSchema.safeParse(validDraft);
    results.push({
      name: 'Outreach Draft Schema: Enforces personalization reason and confidence',
      passed: parsed.success,
      message: parsed.success ? 'Draft schema validated' : 'Validation failed',
    });
  } catch (err: any) {
    results.push({ name: 'Outreach Draft schema test', passed: false, message: err?.message });
  }

  // Test 5: LearningExtractionSchema validation
  try {
    const validLearning = {
      learning: 'Clients in the salon niche ask for visual proof before inquiring about pricing.',
      type: 'NICHE_BEHAVIOR',
      evidence: ['Can I see your hair salon portfolio first?'],
      confidence: 'HIGH',
      appliesTo: 'Salon',
    };

    const parsed = LearningExtractionSchema.safeParse(validLearning);
    results.push({
      name: 'Learning Extraction Schema: Enforces structured memory categorization',
      passed: parsed.success,
      message: parsed.success ? 'Learning schema validated' : 'Validation failed',
    });
  } catch (err: any) {
    results.push({ name: 'Learning schema test', passed: false, message: err?.message });
  }

  return results;
}
