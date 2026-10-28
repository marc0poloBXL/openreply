/**
 * Diagnose the database state for the DM pipeline:
 * - which automations exist and whether DM triggers / lead magnet are enabled
 * - whether ANY webhook event was ever received (WebhookEvent table)
 * - supporting table counts (DmLog, ProcessedComment, DmFlowState, Lead)
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../app/generated/prisma/client";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const IG_USER_ID = "17841438935909153";

async function main() {
  // ── Account ──
  const account = await prisma.instagramAccount.findUnique({
    where: { instagramId: IG_USER_ID },
  });
  if (!account) {
    console.error("InstagramAccount not found for", IG_USER_ID);
    process.exit(1);
  }
  console.log("=== ACCOUNT ===");
  console.log("username:", account.username);
  console.log("name:", account.name);
  console.log("webhookSubscribed:", account.webhookSubscribed);
  console.log("tokenExpiresAt:", account.tokenExpiresAt?.toISOString() ?? "unknown");
  console.log("connectedAt:", account.connectedAt.toISOString());

  // ── All accounts (context) ──
  const allAccounts = await prisma.instagramAccount.findMany({
    select: { id: true, instagramId: true, username: true, webhookSubscribed: true },
  });
  console.log("\n=== ALL INSTAGRAM ACCOUNTS ===");
  allAccounts.forEach((a) =>
    console.log(`  ${a.username} (${a.instagramId}) webhookSubscribed=${a.webhookSubscribed}`)
  );

  // ── Automations ──
  const automations = await prisma.automation.findMany({
    where: { instagramAccountId: account.id },
    orderBy: { createdAt: "desc" },
  });
  console.log("\n=== AUTOMATIONS for", account.username, `(${automations.length}) ===`);
  for (const a of automations) {
    console.log(`  [${a.id}] "${a.name}"`);
    console.log(`    isActive=${a.isActive} dmTriggerEnabled=${a.dmTriggerEnabled} dmLeadMagnetEnabled=${a.dmLeadMagnetEnabled ?? a.dmLeadMagnetEnabled}`);
    console.log(`    keywords=[${a.keywords.join(", ")}] matchAnyWord=${a.matchAnyWord}`);
    console.log(`    dmMessage=${JSON.stringify(a.dmMessage?.slice(0, 80))}`);
    console.log(`    openingDmEnabled=${a.openingDmEnabled} openingDmMessage=${JSON.stringify(a.openingDmMessage?.slice(0, 60))}`);
    console.log(`    followUpEnabled=${a.followUpEnabled} reportShareSlug=${a.reportShareSlug}`);
  }

  // ── WebhookEvent ──
  const webhookTotal = await prisma.webhookEvent.count();
  const webhookByStatus = await prisma.webhookEvent.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  console.log("\n=== WEBHOOK EVENTS ===");
  console.log("total:", webhookTotal);
  webhookByStatus.forEach((s) => console.log(`  ${s.status}: ${s._count._all}`));
  const latestWebhooks = await prisma.webhookEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, object: true, status: true, errorMessage: true, createdAt: true },
  });
  if (latestWebhooks.length > 0) {
    console.log("latest 5:");
    latestWebhooks.forEach((w) =>
      console.log(
        `  ${w.createdAt.toISOString()} object=${w.object} status=${w.status} err=${w.errorMessage ?? "-"}`
      )
    );
  }

  // ── Supporting tables ──
  console.log("\n=== SUPPORTING COUNTS ===");
  console.log("DmLog total:", await prisma.dmLog.count());
  console.log("DmLog for account:", await prisma.dmLog.count({ where: { instagramAccountId: account.id } }));
  console.log("ProcessedComment total:", await prisma.processedComment.count());
  console.log("ProcessedComment for account:", await prisma.processedComment.count({ where: { instagramAccountId: account.id } }));
  console.log("DmFlowState total:", await prisma.dmFlowState.count());
  console.log("DmFlowState for account:", await prisma.dmFlowState.count({ where: { instagramAccountId: account.id } }));
  console.log("Lead total:", await prisma.lead.count());

  const dmLogStatus = await prisma.dmLog.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  if (dmLogStatus.length > 0) {
    console.log("DmLog by status:");
    dmLogStatus.forEach((s) => console.log(`  ${s.status}: ${s._count._all}`));
  }

  // ── DmFlowState rows (the lead-magnet flow state) ──
  const flowRows = await prisma.dmFlowState.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      userId: true,
      step: true,
      automationId: true,
      zodiacSign: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  console.log("\n=== DM FLOW STATE ROWS (latest 5) ===");
  if (flowRows.length === 0) {
    console.log("  (none)");
  }
  flowRows.forEach((f) =>
    console.log(
      `  id=${f.id} userId=${f.userId} step=${f.step} automationId=${f.automationId} zodiac=${f.zodiacSign ?? "-"} created=${f.createdAt.toISOString()} updated=${f.updatedAt.toISOString()}`
    )
  );

  console.log("\n=== DONE ===");
}

main()
  .catch((e) => {
    console.error("Script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });