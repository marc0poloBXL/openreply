/**
 * Drill into the DmLog rows (10 SENT / 2 FAILED) and classify the WebhookEvent payloads
 * to understand what actually happened in the DM pipeline.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../app/generated/prisma/client";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // ── DmLog rows in detail ──
  console.log("=== DMLOG ROWS (all) ===");
  const dmLogs = await prisma.dmLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  for (const d of dmLogs) {
    console.log(`[${d.id}] status=${d.status}`);
    console.log(`  automationId=${d.automationId ?? "-"} commentId=${d.commentId ?? "-"} commenterId=${d.commenterId ?? "-"}`);
    console.log(
      `  attempts=${d.attempts ?? "-"} createdAt=${(d as any).createdAt?.toISOString?.() ?? "-"} dmSentAt=${d.dmSentAt?.toISOString?.() ?? "-"}`
    );
    console.log(`  errorMessage=${d.errorMessage ? JSON.stringify(d.errorMessage.slice(0, 300)) : "-"}`);
    console.log(`  publicReplySentAt=${d.publicReplySentAt?.toISOString?.() ?? "-"}`);
  }

  // ── WebhookEvent payloads: classify event types ──
  console.log("\n=== WEBHOOK EVENTS (latest 12, classified) ===");
  const webhooks = await prisma.webhookEvent.findMany({ orderBy: { createdAt: "desc" }, take: 12 });
  for (const w of webhooks) {
    const payload = (w.payload ?? {}) as any;
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const field = change?.field ?? "?";
    const v = change?.value ?? {};
    // Classify: messages have dm_id / message / from; comments have id / text / media
    let kind = field;
    if (field === "messaging_optins") kind = "OPTIN (lead-magnet button / response)";
    if (field === "comments") kind = "COMMENT " + (v.text ? JSON.stringify(String(v.text).slice(0, 50)) : "");
    if (field === "mentions") kind = "MENTION";
    if (v.from && field !== "comments" && field !== "mentions") {
      if (v.dm_id !== undefined) kind = "MESSAGE (dm_id=" + v.dm_id + ")";
      else kind = "MESSAGE-ish";
      kind += " from=" + JSON.stringify(v.from?.username ?? v.from?.id ?? "?");
      if (v.message) kind += " text=" + JSON.stringify(String(v.message).slice(0, 40));
    }
    console.log(`${w.createdAt.toISOString()}  object=${w.object}  status=${w.status}  ${kind}`);
  }

  // Show one full raw payload (most recent) for ground truth
  const mostRecent = webhooks[0];
  if (mostRecent) {
    console.log("\n=== FULL RAW PAYLOAD (most recent) ===");
    console.log(JSON.stringify(mostRecent.payload, null, 2).slice(0, 4000));
  }

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