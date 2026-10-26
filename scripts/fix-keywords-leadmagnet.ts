/**
 * Fix the DM keyword matching gate for the Birthday Reading lead magnet.
 *
 * Root cause: dmLeadMagnetEnabled only bypasses keyword matching for users
 * who ALREADY have a DmFlowState record. New users sending natural language
 * DMs ("hello", "birthday reading") don't match the keyword ["LINK"] and
 * have no existing flow, so they get continue'd past.
 *
 * Fix: expand keywords to include natural language triggers and set
 * matchAnyWord: true, so initial DMs in natural language still match.
 *
 * Usage: npx tsx --env-file=.env scripts/fix-keywords-leadmagnet.ts
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../app/generated/prisma/client";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const automation = await prisma.automation.findFirst({
    where: {
      instagramAccount: { username: "stoiczodiac" },
      name: { contains: "Birthday" },
    },
  });

  if (!automation) {
    console.log("❌ Birthday Reading automation not found for @stoiczodiac");
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log("=== BEFORE ===");
  console.log("ID:", automation.id);
  console.log("Name:", automation.name);
  console.log("Keywords:", JSON.stringify(automation.keywords));
  console.log("matchAnyWord:", automation.matchAnyWord);
  console.log("dmLeadMagnetEnabled:", automation.dmLeadMagnetEnabled);
  console.log("");

  const updated = await prisma.automation.update({
    where: { id: automation.id },
    data: {
      keywords: ["birthday", "reading", "free", "stoic", "hello", "LINK"],
      matchAnyWord: true,
      dmLeadMagnetEnabled: true,
    },
  });

  console.log("=== AFTER ===");
  console.log("Keywords:", JSON.stringify(updated.keywords));
  console.log("matchAnyWord:", updated.matchAnyWord);
  console.log("dmLeadMagnetEnabled:", updated.dmLeadMagnetEnabled);
  console.log("");
  console.log("✅ Fix applied successfully.");
  console.log("   Natural language DMs will now match the Birthday Reading automation.");

  // Also log the gate code that was blocking new users (for documentation)
  console.log("");
  console.log("--- What was fixed ---");
  console.log("File: lib/queue/dm-worker.ts lines 1125-1148");
  console.log("The gate checks keywords first, then falls back to dmLeadMagnetEnabled");
  console.log("BUT only for users WITH an existing DmFlowState record.");
  console.log("New users had no record, so dmLeadMagnetEnabled was irrelevant.");
  console.log("With expanded keywords + matchAnyWord: true, natural language DMs match.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Script failed:", e);
  process.exit(1);
});