-- DropIndex
DROP INDEX "DmLog_status_idx";

-- AlterTable
ALTER TABLE "BirthdayReading" ALTER COLUMN "birthDate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Automation" ADD COLUMN     "dmLeadMagnetEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DmFlowState" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "step" TEXT NOT NULL DEFAULT 'ask_zodiac',
    "zodiacSign" TEXT,
    "email" TEXT,
    "readingId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DmFlowState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DmFlowState_instagramAccountId_step_idx" ON "DmFlowState"("instagramAccountId", "step");

-- CreateIndex
CREATE UNIQUE INDEX "DmFlowState_automationId_userId_key" ON "DmFlowState"("automationId", "userId");

-- AddForeignKey
ALTER TABLE "DmFlowState" ADD CONSTRAINT "DmFlowState_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmFlowState" ADD CONSTRAINT "DmFlowState_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmFlowState" ADD CONSTRAINT "DmFlowState_readingId_fkey" FOREIGN KEY ("readingId") REFERENCES "BirthdayReading"("id") ON DELETE SET NULL ON UPDATE CASCADE;
