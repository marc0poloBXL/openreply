-- Migration: add_crm_birthday_reading
-- Adds CRM models for birthday readings, followup campaigns, and lead consent tracking.

-- Add columns to Lead
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "consentEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "consentSms" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "consentEmailAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "consentSmsAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "birthDate" DATE;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "birthTime" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "birthplace" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Lead_consentEmail_idx" ON "Lead"("consentEmail");
CREATE INDEX IF NOT EXISTS "Lead_consentSms_idx" ON "Lead"("consentSms");
CREATE INDEX IF NOT EXISTS "LeadEvent_leadId_createdAt_idx" ON "LeadEvent"("leadId", "createdAt");

-- DmLog indexes for hot query paths (worker dedup, read receipts, stats)
CREATE INDEX IF NOT EXISTS "DmLog_commentId_idx" ON "DmLog"("commentId");
CREATE INDEX IF NOT EXISTS "DmLog_automationId_commenterId_idx" ON "DmLog"("automationId", "commenterId");
CREATE INDEX IF NOT EXISTS "DmLog_workspaceId_createdAt_idx" ON "DmLog"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "DmLog_workspaceId_status_createdAt_idx" ON "DmLog"("workspaceId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "DmLog_automationId_status_createdAt_idx" ON "DmLog"("automationId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "DmLog_instagramAccountId_commenterId_status_idx" ON "DmLog"("instagramAccountId", "commenterId", "status");

-- CreateTable: BirthdayReading
CREATE TABLE IF NOT EXISTS "BirthdayReading" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "birthDate" DATE NOT NULL,
    "birthTime" TEXT,
    "birthplace" TEXT,
    "readingType" TEXT NOT NULL DEFAULT 'stoic-life-blueprint',
    "readingText" TEXT,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BirthdayReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BirthdayReading_leadId_idx" ON "BirthdayReading"("leadId");
CREATE INDEX IF NOT EXISTS "BirthdayReading_createdAt_idx" ON "BirthdayReading"("createdAt");

-- AddForeignKey
ALTER TABLE "BirthdayReading" ADD CONSTRAINT "BirthdayReading_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: FollowupCampaign
CREATE TABLE IF NOT EXISTS "FollowupCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowupCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FollowupCampaign_triggerEvent_idx" ON "FollowupCampaign"("triggerEvent");
CREATE INDEX IF NOT EXISTS "FollowupCampaign_isActive_idx" ON "FollowupCampaign"("isActive");

-- CreateTable: FollowupStep
CREATE TABLE IF NOT EXISTS "FollowupStep" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "waitDays" INTEGER NOT NULL DEFAULT 0,
    "emailSubject" TEXT,
    "emailBody" TEXT,
    "smsBody" TEXT,
    "conditionType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowupStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FollowupStep_campaignId_stepNumber_key" ON "FollowupStep"("campaignId", "stepNumber");
CREATE INDEX IF NOT EXISTS "FollowupStep_campaignId_idx" ON "FollowupStep"("campaignId");

-- AddForeignKey
ALTER TABLE "FollowupStep" ADD CONSTRAINT "FollowupStep_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "FollowupCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ScheduledFollowup
CREATE TABLE IF NOT EXISTS "ScheduledFollowup" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "followupStepId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledFollowup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ScheduledFollowup_leadId_followupStepId_key" ON "ScheduledFollowup"("leadId", "followupStepId");
CREATE INDEX IF NOT EXISTS "ScheduledFollowup_leadId_status_idx" ON "ScheduledFollowup"("leadId", "status");
CREATE INDEX IF NOT EXISTS "ScheduledFollowup_status_scheduledAt_idx" ON "ScheduledFollowup"("status", "scheduledAt");

-- AddForeignKey
ALTER TABLE "ScheduledFollowup" ADD CONSTRAINT "ScheduledFollowup_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledFollowup" ADD CONSTRAINT "ScheduledFollowup_followupStepId_fkey" FOREIGN KEY ("followupStepId") REFERENCES "FollowupStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;