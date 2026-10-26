/**
 * Comprehensive diagnostic for the DM lead magnet flow.
 * Checks workspace limits, operational events, webhook events, DM logs,
 * and flow states in a single run.
 *
 * Usage: npx tsx --env-file=.env scripts/diagnose-dm-flow.ts
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../app/generated/prisma/client";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("========== DM FLOW DIAGNOSTIC ==========");
  console.log("");

  // 1. InstagramAccount + Automation
  console.log("--- 1. Automation State ---");
  const account = await prisma.instagramAccount.findFirst({
    where: { username: "stoiczodiac" },
    include: { automations: true, workspace: true },
  });

  if (!account) {
    console.log("❌ No InstagramAccount found for @stoiczodiac\n");
    process.exit(1);
  }

  console.log("Account:", account.username, "(ID:", account.id, ")");
  console.log("Webhook subscribed:", account.webhookSubscribed);
  console.log("Token expires:", account.tokenExpiresAt?.toISOString() ?? "N/A");
  console.log("Token length:", account.accessToken.length, "chars");
  console.log("");

  for (const a of account.automations) {
    console.log("Automation:", a.name);
    console.log("  isActive:", a.isActive);
    console.log("  dmTriggerEnabled:", a.dmTriggerEnabled);
    console.log("  dmLeadMagnetEnabled:", a.dmLeadMagnetEnabled);
    console.log("  matchAnyWord:", a.matchAnyWord);
    console.log("  keywords:", JSON.stringify(a.keywords));
    console.log("  requireFollow:", a.requireFollow);
    console.log("  has dmMessage:", !!a.dmMessage);
    console.log("  has openingDmMessage:", !!a.openingDmMessage);
    console.log("");

    // 2. DmFlowState counts per step
    console.log("  DmFlowState counts:");
    const steps = await prisma.dmFlowState.groupBy({
      by: ["step"],
      where: { automationId: a.id },
      _count: true,
    });
    if (steps.length === 0) {
      console.log("    (no flow states yet — this is normal if no DMs have arrived)");
    } else {
      for (const s of steps) {
        console.log("    ", s.step, ":", s._count);
      }
    }
    console.log("");

    // 3. DmLog summary for this automation
    console.log("  DmLog status counts:");
    const statuses = await prisma.dmLog.groupBy({
      by: ["status"],
      where: { automationId: a.id },
      _count: true,
    });
    if (statuses.length === 0) {
      console.log("    (no DM logs yet)");
    } else {
      for (const s of statuses) {
        console.log("    ", s.status, ":", s._count);
      }
    }
    console.log("");
  }

  // 4. Workspace plan limits
  console.log("--- 2. Workspace Plan Limits ---");
  const workspace = account.workspace;
  console.log("Workspace:", workspace.name);
  console.log("dmsSentThisPeriod:", workspace.dmsSentThisPeriod);
  console.log("usagePeriodStart:", workspace.usagePeriodStart.toISOString());
  console.log("");

  // 5. Recent OperationalEvent records (last 50)
  console.log("--- 3. Recent Operational Events (last 30) ---");
  const ops = await prisma.operationalEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  if (ops.length === 0) {
    console.log("  (no operational events)");
  } else {
    for (const o of ops) {
      console.log(`  [${o.level}] ${o.source}: ${o.message.slice(0, 200)}`);
      console.log(`    at ${o.createdAt.toISOString()}`);
      if (o.resolvedAt) console.log(`    resolved: ${o.resolvedAt.toISOString()}`);
    }
  }
  console.log("");

  // 6. Recent WebhookEvent records (last 30)
  console.log("--- 4. Recent Webhook Events (last 30) ---");
  const webhooks = await prisma.webhookEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  if (webhooks.length === 0) {
    console.log("  (no webhook events recorded)");
  } else {
    for (const w of webhooks) {
      const entry = (w.payload as any)?.entry?.[0];
      const messaging = entry?.messaging?.[0];
      const changes = entry?.changes?.[0];
      const isMessaging = !!messaging;
      const isChanges = !!changes;
      const msgText = messaging?.message?.text ?? changes?.value?.message ?? "N/A";
      const senderId = messaging?.sender?.id ?? changes?.value?.sender?.id ?? "N/A";
      const eventType = isChanges ? changes?.field ?? "changes" : "messaging";
      console.log(`  [${w.status}] type=${eventType} created: ${w.createdAt.toISOString()}`);
      console.log(`    sender: ${senderId} text: "${msgText}"`);
      if (isChanges) console.log(`    change field: ${changes.field} value item: ${changes.value?.item ?? "N/A"}`);
      if (w.processedAt) console.log(`    processed: ${w.processedAt.toISOString()}`);
      if (w.errorMessage) console.log(`    error: ${w.errorMessage}`);
    }
  }
  console.log("");

  // 7. Recent DmLog records (last 20)
  console.log("--- 5. Recent DM Logs (last 20) ---");
  const dmlogs = await prisma.dmLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  if (dmlogs.length === 0) {
    console.log("  (no DM logs yet)");
  } else {
    for (const d of dmlogs) {
      console.log(`  [${d.status}] attempts: ${d.attempts} commenter: ${d.commenterName ?? d.commenterId}`);
      console.log(`    comment: "${d.commentText.slice(0, 100)}" keyword: ${d.matchedKeyword ?? "N/A"}`);
      console.log(`    at ${d.createdAt.toISOString()}`);
      if (d.errorMessage) console.log(`    error: ${d.errorMessage}`);
    }
  }
  console.log("");

  // 8. Check if the token decrypts successfully
  console.log("--- 6. Token Decrypt Check ---");
  try {
    const { decryptToken } = await import("../lib/meta/oauth");
    const decrypted = await decryptToken(account.accessToken);
    if (decrypted && decrypted.length > 0) {
      console.log("✅ Token decrypts successfully (length:", decrypted.length, "chars)");
    } else {
      console.log("⚠️ Token decrypted but is empty");
    }
  } catch (e: any) {
    console.log("❌ Token decryption FAILED:", e.message);
  }
  console.log("");

  console.log("========== DIAGNOSTIC COMPLETE ==========");
}

main()
  .catch((e) => {
    console.error("Script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });