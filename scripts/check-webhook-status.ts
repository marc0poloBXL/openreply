/**
 * Read-only webhook/automation status check for @stoiczodiac.
 *
 * Usage: npx tsx --env-file=.env scripts/check-webhook-status.ts
 *         (--env-file=.env — NOT .env.local — because DATABASE_URL lives in .env;
 *          running with .env.local causes ECONNREFUSED on localhost:5432)
 */

import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../app/generated/prisma/client";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const account = await prisma.instagramAccount.findFirst({
    where: { username: "stoiczodiac" },
  });

  if (!account) {
    console.log("❌ Instagram account @stoiczodiac not found in DB.");
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log("=== Instagram Account @stoiczodiac ===");
  console.log("ID:", account.id);
  console.log("instagramId:", account.instagramId);
  console.log("webhookSubscribed:", account.webhookSubscribed);
  console.log("tokenExpiresAt:", account.tokenExpiresAt);
  console.log("connectedAt:", account.connectedAt);
  console.log("pageToken set:", account.pageToken ? "✅ YES" : "❌ NO");
  console.log("accessToken set:", account.accessToken ? "✅ YES" : "❌ NO");
  console.log("");

  // Check if there's any recent DmFlowState activity
  const flowCount = await prisma.dmFlowState.count({
    where: {
      automation: { instagramAccountId: account.id },
    },
  });
  console.log("DM Flow States count:", flowCount);

  if (flowCount > 0) {
    const recent = await prisma.dmFlowState.findMany({
      where: { automation: { instagramAccountId: account.id } },
      orderBy: { updatedAt: "desc" },
      take: 3,
    });
    for (const f of recent) {
      console.log(`  - step=${f.step} userId=${f.userId} created=${f.createdAt.toISOString()}`);
    }
  }

  // Check the automation
  const automation = await prisma.automation.findFirst({
    where: {
      instagramAccountId: account.id,
      name: { contains: "Birthday" },
    },
  });

  if (automation) {
    console.log("");
    console.log("=== Birthday Automation ===");
    console.log("isActive:", automation.isActive);
    console.log("dmTriggerEnabled:", automation.dmTriggerEnabled);
    console.log("dmLeadMagnetEnabled:", automation.dmLeadMagnetEnabled);
    console.log("matchAnyWord:", automation.matchAnyWord);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Script failed:", e);
  process.exit(1);
});