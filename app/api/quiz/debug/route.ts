import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const results: Record<string, any> = {};

  try {
    // Try to create the Lead table
    results.leadTable = await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Lead" (
        "id" TEXT NOT NULL,
        "workspaceId" TEXT,
        "email" TEXT NOT NULL,
        "zodiacSign" TEXT,
        "stoicMatch" TEXT,
        "stoicTitle" TEXT,
        "element" TEXT,
        "phone" TEXT,
        "source" TEXT NOT NULL DEFAULT 'quiz',
        "leadScore" INTEGER NOT NULL DEFAULT 0,
        "status" TEXT NOT NULL DEFAULT 'new',
        "lastContactedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
      );
    `);
  } catch (e: any) {
    results.leadTableError = e.message;
  }

  try {
    results.leadUnique = await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "Lead_email_key" ON "Lead"("email");
    `);
  } catch (e: any) {
    results.leadUniqueError = e.message;
  }

  try {
    results.leadIdx1 = await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Lead_workspaceId_idx" ON "Lead"("workspaceId");
    `);
  } catch (e: any) {
    results.leadIdx1Error = e.message;
  }

  try {
    results.leadIdx2 = await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Lead_status_idx" ON "Lead"("status");
    `);
  } catch (e: any) {
    results.leadIdx2Error = e.message;
  }

  try {
    results.leadIdx3 = await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Lead_zodiacSign_idx" ON "Lead"("zodiacSign");
    `);
  } catch (e: any) {
    results.leadIdx3Error = e.message;
  }

  // LeadEvent table
  try {
    results.leadEventTable = await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "LeadEvent" (
        "id" TEXT NOT NULL,
        "leadId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "LeadEvent_pkey" PRIMARY KEY ("id")
      );
    `);
  } catch (e: any) {
    results.leadEventTableError = e.message;
  }

  try {
    results.leIdx1 = await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "LeadEvent_leadId_idx" ON "LeadEvent"("leadId");
    `);
  } catch (e: any) {
    results.leIdx1Error = e.message;
  }

  try {
    results.leIdx2 = await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "LeadEvent_type_idx" ON "LeadEvent"("type");
    `);
  } catch (e: any) {
    results.leIdx2Error = e.message;
  }

  // Foreign keys
  try {
    results.fk1 = await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "Lead" ADD CONSTRAINT "Lead_workspaceId_fkey"
          FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
  } catch (e: any) {
    results.fk1Error = e.message;
  }

  try {
    results.fk2 = await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "LeadEvent" ADD CONSTRAINT "LeadEvent_leadId_fkey"
          FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
  } catch (e: any) {
    results.fk2Error = e.message;
  }

  // Verify
  try {
    results.verify = await prisma.lead.count();
  } catch (e: any) {
    results.verifyError = e.message;
  }

  return NextResponse.json(results);
}