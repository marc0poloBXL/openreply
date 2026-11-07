/**
 * Fix the DM trigger for the Birthday Reading lead magnet on @stoiczodiac.
 *
 * Root cause (TWO gates blocking the flow):
 *   1. dmTriggerEnabled defaults to false → processMessage() query at dm-worker.ts:1151
 *      filters out the automation entirely. This is the PRIMARY fix.
 *   2. dmLeadMagnetEnabled also defaults to false, but was already handled in a prior
 *      partial fix that missed dmTriggerEnabled.
 *   3. matchAnyWord defaults to false, so natural-language DMs ("hello", "birthday")
 *      are silently skipped for new users with no DmFlowState.
 *
 * Fix: set dmTriggerEnabled: true, dmLeadMagnetEnabled: true, matchAnyWord: true,
 *      isActive: true.
 *
 * Why matchAnyWord=true: parseSignAnswer() in conversation.ts already handles all 24
 * English + French sign name variants via SIGN_ALIASES. Any DM will enter the lead
 * magnet state machine, which gracefully handles non-sign replies with a zodiacRetry
 * message — so there is no downside to matching every DM.
 *
 * Usage: npx tsx --env-file=.env scripts/fix-birthday-dm-trigger.ts
 *         (--env-file=.env — NOT .env.local — because DATABASE_URL lives in .env)
 */

import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../app/generated/prisma/client";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // ── Step 1: Find the Birthday Reading automation ──────────────────────────
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
  console.log("wholeWordMatch:", automation.wholeWordMatch);
  console.log("dmTriggerEnabled:", automation.dmTriggerEnabled);
  console.log("dmLeadMagnetEnabled:", automation.dmLeadMagnetEnabled);
  console.log("isActive:", automation.isActive);
  console.log("");

  // ── Step 2: Apply the fix ─────────────────────────────────────────────────
  const updated = await prisma.automation.update({
    where: { id: automation.id },
    data: {
      // PRIMARY FIX: without this, processMessage() silently skips the automation
      dmTriggerEnabled: true,
      // SECONDARY FIX: gate that controls lead magnet flow entry
      dmLeadMagnetEnabled: true,
      // Ensure the automation is active
      isActive: true,
      // Skip keyword matching entirely — parseSignAnswer handles sign detection
      matchAnyWord: true,
      // Expand keywords for safety even if matchAnyWord is true
      keywords: [
        "birthday", "reading", "free", "report", "stoic",
        "zodiac", "horoscope", "hello", "hi", "LINK",
      ],
    },
  });

  // ── Step 3: Report result ──────────────────────────────────────────────────
  console.log("=== AFTER ===");
  console.log("Keywords:", JSON.stringify(updated.keywords));
  console.log("matchAnyWord:", updated.matchAnyWord);
  console.log("wholeWordMatch:", updated.wholeWordMatch);
  console.log("dmTriggerEnabled:", updated.dmTriggerEnabled);
  console.log("dmLeadMagnetEnabled:", updated.dmLeadMagnetEnabled);
  console.log("isActive:", updated.isActive);
  console.log("");

  if (
    updated.dmTriggerEnabled === true &&
    updated.dmLeadMagnetEnabled === true &&
    updated.matchAnyWord === true &&
    updated.isActive === true
  ) {
    console.log("✅ ALL FIXES APPLIED SUCCESSFULLY.");
    console.log("   DM trigger is now enabled for the Birthday Reading automation.");
    console.log("   Any DM to @stoiczodiac will trigger the lead magnet flow.");
  } else {
    console.log("⚠️  Not all fields were updated as expected. Review above.");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Script failed:", e);
  process.exit(1);
});