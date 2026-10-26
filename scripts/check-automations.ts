/**
 * Check InstagramAccount + Automation database state for @stoiczodiac.
 * Focus: dmTriggerEnabled, dmLeadMagnetEnabled, keywords, matchAnyWord, isActive.
 *
 * Usage: npx tsx scripts/check-automations.ts
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../app/generated/prisma/client";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const account = await prisma.instagramAccount.findFirst({
    where: { username: "stoiczodiac" },
    include: { automations: true },
  });

  if (!account) {
    console.log("❌ No InstagramAccount found for @stoiczodiac");
    console.log("   Create one in the dashboard before testing the DM flow.");
    process.exit(1);
  }

  console.log("=== InstagramAccount @stoiczodiac ===");
  console.log("ID:", account.id);
  console.log("Instagram ID:", account.instagramId);
  console.log("Webhook subscribed:", account.webhookSubscribed);
  console.log("Token expires at:", account.tokenExpiresAt?.toISOString() ?? "N/A");
  console.log("");

  if (account.automations.length === 0) {
    console.log("⚠️  No Automations found for this account.");
    console.log("   Create one in the dashboard before testing the DM flow.");
    process.exit(0);
  }

  for (const a of account.automations) {
    console.log("--- Automation:", a.id, "---");
    console.log("  Name:             ", a.name);
    console.log("  isActive:         ", a.isActive);
    console.log("  dmTriggerEnabled: ", a.dmTriggerEnabled);
    console.log("  dmLeadMagnetEnabled:", a.dmLeadMagnetEnabled);
    console.log("  keywords:         ", JSON.stringify(a.keywords));
    console.log("  matchAnyWord:     ", a.matchAnyWord);
    console.log("  dmMessage:        ", a.dmMessage ? a.dmMessage.slice(0, 120) + "…" : "(not set)");
    console.log("  Goal:             ", a.goal ?? "(not set)");
    console.log("");

    // Validity check
    const issues: string[] = [];
    if (!a.isActive) issues.push("isActive is false — automation won't fire");
    if (!a.dmTriggerEnabled) issues.push("dmTriggerEnabled is false — DM trigger not active");
    if (!a.dmLeadMagnetEnabled) issues.push("dmLeadMagnetEnabled is false — lead magnet not active");
    if (!a.keywords || a.keywords.length === 0) issues.push("no keywords configured");
    if (!a.dmMessage) issues.push("dmMessage not set");
    if (!a.goal) issues.push("goal not set — consider documenting what this automation does");

    if (issues.length === 0) {
      console.log("  ✅ All checks passed — this Automation is ready for DM flow testing.");
    } else {
      console.log("  ⚠️  Issues found:");
      for (const issue of issues) {
        console.log("    -", issue);
      }
    }
    console.log("");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Script failed:", e);
  process.exit(1);
});