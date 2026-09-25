-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "personName" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "instagramUsername" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "location" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "website" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "niche" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "source" TEXT NOT NULL DEFAULT 'INSTAGRAM',
    "sourceConversationId" TEXT,
    "conversationSummary" TEXT,
    "intent" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "interestLevel" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "qualification" TEXT NOT NULL DEFAULT 'PENDING_INFO',
    "qualificationReason" TEXT,
    "offerDiscussed" TEXT,
    "priceDiscussed" TEXT,
    "objections" TEXT,
    "importantMessages" TEXT,
    "followUpNeeded" BOOLEAN NOT NULL DEFAULT false,
    "followUpReason" TEXT,
    "portfolioMatch" TEXT NOT NULL DEFAULT 'NO_MATCH',
    "suggestedNextAction" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'LOW',
    "opportunityScore" INTEGER NOT NULL DEFAULT 0,
    "opportunitySegment" TEXT NOT NULL DEFAULT 'UNSCORED',
    "scoreBreakdown" TEXT,
    "evidence" TEXT,
    "notes" TEXT,
    "aiPaused" BOOLEAN NOT NULL DEFAULT false,
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "optOutAt" TIMESTAMP(3),
    "instagramScopedId" TEXT,
    "messagingAuthorizedAt" TIMESTAMP(3),
    "facebookPageUrl" TEXT,
    "publicDiscoverySource" TEXT,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "followUpAttempts" INTEGER NOT NULL DEFAULT 0,
    "followUpMaxAttempts" INTEGER NOT NULL DEFAULT 1,
    "followUpNextAt" TIMESTAMP(3),
    "conversationStage" TEXT NOT NULL DEFAULT 'NEW',
    "lastAgentActionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'INSTAGRAM',
    "title" TEXT NOT NULL DEFAULT 'Untitled Conversation',
    "participantNames" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "rawMetadata" TEXT,
    "leadId" TEXT,
    "importId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "senderType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceMessageId" TEXT,
    "metadata" TEXT,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "conversationId" TEXT,
    "intent" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "intentReason" TEXT,
    "intentConfidence" TEXT NOT NULL DEFAULT 'LOW',
    "qualification" TEXT NOT NULL DEFAULT 'PENDING_INFO',
    "qualificationReason" TEXT,
    "objections" TEXT,
    "portfolioMatched" TEXT NOT NULL DEFAULT 'NO_MATCH',
    "suggestedAction" TEXT,
    "evidenceList" TEXT,
    "conversationStage" TEXT,
    "needsHuman" BOOLEAN NOT NULL DEFAULT false,
    "needsRequirements" BOOLEAN NOT NULL DEFAULT false,
    "asksPricing" BOOLEAN NOT NULL DEFAULT false,
    "purchaseIntent" BOOLEAN NOT NULL DEFAULT false,
    "rawAiResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Learning" (
    "id" TEXT NOT NULL,
    "learning" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "evidence" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'MEDIUM',
    "appliesTo" TEXT NOT NULL DEFAULT 'General',
    "source" TEXT NOT NULL DEFAULT 'CONVERSATION_ANALYSIS',
    "relatedLeadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Learning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Import" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'INSTAGRAM',
    "fileName" TEXT NOT NULL,
    "filePath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "filesDiscovered" INTEGER NOT NULL DEFAULT 0,
    "supportedFiles" INTEGER NOT NULL DEFAULT 0,
    "unsupportedFiles" INTEGER NOT NULL DEFAULT 0,
    "conversationCount" INTEGER NOT NULL DEFAULT 0,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "leadCount" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Import_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Correction" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "originalValue" TEXT NOT NULL,
    "correctedValue" TEXT NOT NULL,
    "userReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Correction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioProject" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "technologies" TEXT,
    "results" TEXT,
    "liveUrl" TEXT,
    "keyFeatures" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachDraft" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'INSTAGRAM_DM',
    "subject" TEXT,
    "messageBody" TEXT NOT NULL,
    "personalizationReason" TEXT,
    "evidenceUsed" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'DRAFTED',
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'MEDIUM',
    "sourceUrl" TEXT,
    "observation" TEXT,
    "fetchedAt" TIMESTAMP(3),
    "evidenceType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessResearch" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "finalUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "source" TEXT NOT NULL DEFAULT 'PUBLIC_WEBSITE',
    "reachable" BOOLEAN NOT NULL DEFAULT false,
    "httpStatus" INTEGER,
    "statusText" TEXT,
    "httpsAvailable" BOOLEAN,
    "httpsStatus" INTEGER,
    "httpsError" TEXT,
    "responseTimeMs" INTEGER,
    "redirectCount" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "metaDescription" TEXT,
    "canonicalUrl" TEXT,
    "language" TEXT,
    "viewportMetaPresent" BOOLEAN,
    "viewportMetaContent" TEXT,
    "h1Count" INTEGER,
    "h1Text" TEXT,
    "imageCount" INTEGER,
    "imagesMissingAlt" INTEGER,
    "robotsTxtPresent" BOOLEAN,
    "bookingLinkDetected" BOOLEAN,
    "bookingLinks" TEXT,
    "contactLinkDetected" BOOLEAN,
    "contactLinks" TEXT,
    "emailLinks" TEXT,
    "phoneLinks" TEXT,
    "socialLinks" TEXT,
    "structuredDataTypes" TEXT,
    "businessName" TEXT,
    "businessType" TEXT,
    "category" TEXT,
    "location" TEXT,
    "publicEmail" TEXT,
    "publicPhone" TEXT,
    "services" TEXT,
    "observations" TEXT,
    "blocked" BOOLEAN,
    "aiSummaryUsed" BOOLEAN NOT NULL DEFAULT false,
    "aiConfidence" TEXT,
    "warnings" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessResearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadQualification" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    "confidence" TEXT NOT NULL DEFAULT 'LOW',
    "reasons" TEXT NOT NULL DEFAULT '[]',
    "portfolioMatch" TEXT NOT NULL DEFAULT 'null',
    "nextAction" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "segment" TEXT NOT NULL DEFAULT 'UNSCORED',
    "scoreBreakdown" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "state" TEXT NOT NULL DEFAULT 'STOPPED',
    "autoDm" BOOLEAN NOT NULL DEFAULT false,
    "maxSendsPerHour" INTEGER NOT NULL DEFAULT 10,
    "maxSendsPerLead" INTEGER NOT NULL DEFAULT 1,
    "followUpDelayHours" INTEGER NOT NULL DEFAULT 72,
    "tickIntervalMs" INTEGER NOT NULL DEFAULT 15000,
    "batchSize" INTEGER NOT NULL DEFAULT 3,
    "discoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "discoveryCity" TEXT,
    "discoveryNiches" TEXT NOT NULL DEFAULT '[]',
    "discoveryLimit" INTEGER NOT NULL DEFAULT 3,
    "lastDiscoveryAt" TIMESTAMP(3),
    "lastDiscoveryKey" TEXT NOT NULL DEFAULT '',
    "currentTask" TEXT,
    "lastAction" TEXT,
    "nextAction" TEXT,
    "leadsProcessed" INTEGER NOT NULL DEFAULT 0,
    "messagesSent" INTEGER NOT NULL DEFAULT 0,
    "repliesReceived" INTEGER NOT NULL DEFAULT 0,
    "interested" INTEGER NOT NULL DEFAULT 0,
    "notInterested" INTEGER NOT NULL DEFAULT 0,
    "personalWork" INTEGER NOT NULL DEFAULT 0,
    "humanRequired" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "noResponse" INTEGER NOT NULL DEFAULT 0,
    "closed" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "leadId" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'INSTAGRAM_DM',
    "recipient" TEXT,
    "body" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRY_RUN',
    "provider" TEXT NOT NULL DEFAULT 'NONE',
    "providerRef" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundMessage" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'INSTAGRAM_DM',
    "provider" TEXT NOT NULL DEFAULT 'META_INSTAGRAM_MESSAGING',
    "providerMessageId" TEXT NOT NULL,
    "senderIgSid" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'INBOUND',
    "deliveryStatus" TEXT NOT NULL DEFAULT 'RECEIVED',
    "humanTakeover" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "minPrice" INTEGER NOT NULL,
    "normalPriceMin" INTEGER NOT NULL,
    "normalPriceMax" INTEGER NOT NULL,
    "maxNegotiation" INTEGER NOT NULL,
    "escalationAbove" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "packageName" TEXT,
    "includedItems" TEXT,
    "deliveryEstimate" TEXT,
    "advancePayment" TEXT,
    "revisions" TEXT,
    "optionalExtras" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningEvent" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "category" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "humanAction" TEXT,
    "evidence" TEXT,
    "outcome" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "supportCount" INTEGER NOT NULL DEFAULT 1,
    "contradictionCount" INTEGER NOT NULL DEFAULT 0,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_instagramScopedId_key" ON "Lead"("instagramScopedId");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_intent_idx" ON "Lead"("intent");

-- CreateIndex
CREATE INDEX "Lead_source_idx" ON "Lead"("source");

-- CreateIndex
CREATE INDEX "Lead_niche_idx" ON "Lead"("niche");

-- CreateIndex
CREATE INDEX "Lead_instagramUsername_idx" ON "Lead"("instagramUsername");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_externalId_key" ON "Conversation"("externalId");

-- CreateIndex
CREATE INDEX "Conversation_externalId_idx" ON "Conversation"("externalId");

-- CreateIndex
CREATE INDEX "Conversation_source_idx" ON "Conversation"("source");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Message_timestamp_idx" ON "Message"("timestamp");

-- CreateIndex
CREATE INDEX "Analysis_leadId_idx" ON "Analysis"("leadId");

-- CreateIndex
CREATE INDEX "Analysis_conversationId_idx" ON "Analysis"("conversationId");

-- CreateIndex
CREATE INDEX "Learning_type_idx" ON "Learning"("type");

-- CreateIndex
CREATE INDEX "Learning_appliesTo_idx" ON "Learning"("appliesTo");

-- CreateIndex
CREATE INDEX "Import_source_idx" ON "Import"("source");

-- CreateIndex
CREATE INDEX "Import_status_idx" ON "Import"("status");

-- CreateIndex
CREATE INDEX "Correction_leadId_idx" ON "Correction"("leadId");

-- CreateIndex
CREATE INDEX "PortfolioProject_category_idx" ON "PortfolioProject"("category");

-- CreateIndex
CREATE INDEX "OutreachDraft_leadId_idx" ON "OutreachDraft"("leadId");

-- CreateIndex
CREATE INDEX "OutreachDraft_status_idx" ON "OutreachDraft"("status");

-- CreateIndex
CREATE INDEX "Evidence_leadId_idx" ON "Evidence"("leadId");

-- CreateIndex
CREATE INDEX "Evidence_evidenceType_idx" ON "Evidence"("evidenceType");

-- CreateIndex
CREATE INDEX "BusinessResearch_leadId_idx" ON "BusinessResearch"("leadId");

-- CreateIndex
CREATE INDEX "BusinessResearch_status_idx" ON "BusinessResearch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessResearch_leadId_targetUrl_key" ON "BusinessResearch"("leadId", "targetUrl");

-- CreateIndex
CREATE INDEX "LeadQualification_leadId_idx" ON "LeadQualification"("leadId");

-- CreateIndex
CREATE INDEX "LeadQualification_status_idx" ON "LeadQualification"("status");

-- CreateIndex
CREATE INDEX "LeadQualification_createdAt_idx" ON "LeadQualification"("createdAt");

-- CreateIndex
CREATE INDEX "AgentEvent_createdAt_idx" ON "AgentEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AgentEvent_type_idx" ON "AgentEvent"("type");

-- CreateIndex
CREATE INDEX "AgentEvent_leadId_idx" ON "AgentEvent"("leadId");

-- CreateIndex
CREATE INDEX "OutboundMessage_leadId_createdAt_idx" ON "OutboundMessage"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_contentHash_idx" ON "OutboundMessage"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "InboundMessage_providerMessageId_key" ON "InboundMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "InboundMessage_leadId_createdAt_idx" ON "InboundMessage"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "InboundMessage_senderIgSid_idx" ON "InboundMessage"("senderIgSid");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_service_key" ON "PricingRule"("service");

-- CreateIndex
CREATE INDEX "LearningEvent_category_status_idx" ON "LearningEvent"("category", "status");

-- CreateIndex
CREATE INDEX "LearningEvent_leadId_idx" ON "LearningEvent"("leadId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_importId_fkey" FOREIGN KEY ("importId") REFERENCES "Import"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Learning" ADD CONSTRAINT "Learning_relatedLeadId_fkey" FOREIGN KEY ("relatedLeadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachDraft" ADD CONSTRAINT "OutreachDraft_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessResearch" ADD CONSTRAINT "BusinessResearch_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadQualification" ADD CONSTRAINT "LeadQualification_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningEvent" ADD CONSTRAINT "LearningEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

