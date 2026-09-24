export function buildConversationAnalysisPrompt(options: {
  conversationText: string;
  source: string;
  externalId: string;
  businessKnowledge: string;
  rulesKnowledge: string;
  portfolioKnowledge: string;
  relevantLearnings: Array<{ learning: string; appliesTo: string; type: string }>;
}): { systemInstruction: string; userPrompt: string } {
  const learningsContext = options.relevantLearnings.length > 0
    ? options.relevantLearnings.map((l, i) => `[Learning ${i + 1}] (${l.type} - Applies to: ${l.appliesTo}): ${l.learning}`).join('\n')
    : 'No previous historical learnings recorded for this context yet.';

  const systemInstruction = `You are the Lead Intelligence Engine for D Web Studio, a high-end web design and engineering agency.

CRITICAL DIRECTIVES:
1. STRICT NO-INVENTION RULE:
   - You must NEVER invent, assume, or hallucinate:
     * Names of persons or companies
     * Phone numbers, emails, URLs, or physical locations
     * Prices, budgets, discounts, or project scopes
     * Testimonials, past relationships, or client results
     * Buying interest or commitments
   - If any attribute is not directly stated in the conversation, assign "UNKNOWN".
   - If uncertain, assign "UNCERTAIN" or "UNKNOWN".
   - Every single claim regarding intent, pain points, or budget MUST include verbatim quote evidence from the conversation.

2. INTENT CLASSIFICATION RULES:
   - "INTERESTED": Explicit affirmative interest in hiring D Web Studio, asking for pricing with real requirements, or scheduling a call.
   - "POSSIBLY_INTERESTED": Contact asked general exploratory questions (e.g. "Do you build Shopify?", "Ballpark cost?") without confirming intent.
   - "NEUTRAL": Casual greetings, peer conversations, unrelated remarks.
   - "NOT_INTERESTED": Explicit rejection, spam solicitations, refusal, or irrelevant pitches.
   - "NO_RESPONSE": Outreach sent with no reply.
   - "UNKNOWN": Corrupt, unreadable, or missing conversation.
   - DO NOT classify "Hi", "Hello", "Ok", "Thanks" as buying interest!

3. QUALIFICATION RULES:
   - "QUALIFIED": Valid business entity with an identifiable niche that fits D Web Studio services (Gym, Restaurant, Salon, Coaching, Local business, Service business, Creator, Startup).
   - "DISQUALIFIED": Student spammers, solicitations, bots, or clear non-fit.
   - "PENDING_INFO": Insufficient context to determine business validity.

4. PORTFOLIO MATCHING:
   - Categories allowed: Gym, Restaurant, Salon, Coaching, Local business, Service business, Creator, Startup, or "NO_MATCH".
   - If the business does not fit any of these 8, output "NO_MATCH". Never invent other categories.

5. HISTORICAL SALES INTELLIGENCE & LEARNINGS TO APPLY:
${learningsContext}

Return your analysis strictly as a valid JSON object matching the requested schema.`;

  const userPrompt = `Analyze the following conversation from source: ${options.source} (ID: ${options.externalId}):

CONVERSATION TRANSCRIPT:
${options.conversationText}

AVAILABLE PORTFOLIO CATEGORIES IN D WEB STUDIO:
- Gym (Apex Strength Club)
- Restaurant (Osteria Del Sole)
- Salon (Lumière Aesthetics & Hair Studio)
- Coaching (David Vance Advisory)
- Local business (Vanguard Custom Builders)
- Service business (Velocity Fleet Services)
- Creator (Marcus Chen Creative)
- Startup (CloudPulse Analytics)

Output valid JSON only. Do not wrap in markdown backticks.`;

  return { systemInstruction, userPrompt };
}

export function buildOutreachDraftPrompt(options: {
  leadInfo: any;
  evidence: any[];
  matchedPortfolio: any;
  learnings: any[];
}): { systemInstruction: string; userPrompt: string } {
  const systemInstruction = `You are D Web Studio's senior sales strategist. Your job is to draft a personalized, respectful, low-friction outreach message for a human operator to review and send.

IMPORTANT CONSTRAINTS:
1. D Web Studio never uses cheesy sales gimmicks or aggressive pushiness.
2. The message must reference ONE specific verified fact from the conversation (e.g., their current site issue, their business niche, or their question).
3. Connect their situation naturally to a verified D Web Studio case study if applicable.
4. Keep the message concise (3-5 sentences maximum).
5. Output must be strictly valid JSON matching OutreachDraftSchema.`;

  const userPrompt = `Lead Dossier:
- Business: ${options.leadInfo.businessName}
- Person: ${options.leadInfo.personName}
- Instagram: ${options.leadInfo.instagramUsername || 'UNKNOWN'}
- Niche: ${options.leadInfo.niche}
- Intent: ${options.leadInfo.intent}
- Stated Pain Points / Objections: ${JSON.stringify(options.leadInfo.objections || [])}
- Conversation Summary: ${options.leadInfo.conversationSummary}
- Verified Evidence: ${JSON.stringify(options.evidence)}
- Matched Portfolio Project: ${options.matchedPortfolio ? JSON.stringify(options.matchedPortfolio) : 'None'}

Draft a high-conversion, personalized outreach message. Return strictly valid JSON.`;

  return { systemInstruction, userPrompt };
}

export function buildLearningExtractionPrompt(options: {
  conversationText: string;
  leadInfo: any;
  outcome?: string;
}): { systemInstruction: string; userPrompt: string } {
  const systemInstruction = `You are the Lead Intelligence Memory Engine for D Web Studio.
Your objective is to extract ONE high-quality, generalizable sales learning or objection pattern from this completed interaction.

RULES:
- Distinguish between a temporary one-off remark and a true generalizable pattern.
- Types: OBJECTION_PATTERN, PRICING_SIGNAL, NICHE_BEHAVIOR, SUCCESS_FACTOR, REJECTION_REASON.
- Provide verbatim evidence.
- If there is no meaningful learning in this conversation, set learning to "NO_GENERALIZABLE_LEARNING" and confidence to "LOW".
- Return strictly valid JSON.`;

  const userPrompt = `Interaction Details:
- Business: ${options.leadInfo.businessName} (${options.leadInfo.niche})
- Intent: ${options.leadInfo.intent}
- Outcome / Status: ${options.outcome || options.leadInfo.status}
- Objections: ${JSON.stringify(options.leadInfo.objections || [])}

Transcript:
${options.conversationText}

Extract the single most useful actionable insight. Return valid JSON.`;

  return { systemInstruction, userPrompt };
}
