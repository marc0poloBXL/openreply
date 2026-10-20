/**
 * Read-only diagnostic for the 2026-10-20 end-to-end test:
 *  - today's dmLog rows (what was actually SENT to the user)
 *  - the Lead row(s) created today (which flow: quiz or birthday_reading)
 *  - the "LINK" automation config (requireFollow, trackedLinks, dmMessage)
 *
 * Prints no secrets. Run: npx tsx prisma/check-dm-test.ts
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL environment variable is required");
const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

async function main() {
  const dayStart = new Date("2026-10-20T00:00:00Z");

  console.log("── DM logs today (2026-10-20) ──");
  const logs = await prisma.dmLog.findMany({
    where: { createdAt: { gte: dayStart } },
    orderBy: { createdAt: "asc" },
  });
  if (logs.length === 0) {
    console.log("(none)");
  }
  for (const l of logs) {
    console.log(`  ${l.createdAt.toISOString()} ${l.status}`);
    console.log(`    type: ${l.commentId}`);
    console.log(`    text: ${(l.commentText ?? "").slice(0, 120)}`);
    console.log(`    commenter: ${l.commenterName ?? l.commenterId ?? "?"}`);
    console.log(`    matched: ${l.matchedKeyword ?? "-"}`);
    if (l.errorMessage) console.log(`    error: ${l.errorMessage}`);
  }

  console.log("\n── Leads created today ──");
  const leads = await prisma.lead.findMany({
    where: { createdAt: { gte: dayStart } },
    orderBy: { createdAt: "asc" },
  });
  if (leads.length === 0) console.log("(none)");
  for (const lead of leads) {
    console.log(`  ${lead.createdAt.toISOString()} ${lead.email}`);
    console.log(`    source: ${lead.source} | sign: ${lead.zodiacSign} | match: ${lead.stoicMatch}`);
    if (lead.consentEmail) console.log(`    consentEmail: yes`);
    console.log(`    workspaceId: ${lead.workspaceId ?? "(none)"}`);
  }

  console.log("\n── Webhook events (delivery of comments/postbacks/DMs from Meta) ──");
  const todayCount = await prisma.webhookEvent.count({
    where: { createdAt: { gte: dayStart } },
  });
  const totalCount = await prisma.webhookEvent.count();
  console.log(`  today (2026-10-20): ${todayCount}`);
  console.log(`  all-time:           ${totalCount}`);
  if (todayCount > 0) {
    const byStatus = await prisma.webhookEvent.groupBy({
      by: ["status"],
      where: { createdAt: { gte: dayStart } },
      _count: true,
    });
    for (const s of byStatus) {
      console.log(`    ${s.status}: ${s._count}`);
    }
    const latest = await prisma.webhookEvent.findFirst({
      where: { createdAt: { gte: dayStart } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, object: true, status: true },
    });
    if (latest) {
      console.log(`  latest: ${latest.createdAt.toISOString()} object=${latest.object} status=${latest.status}`);
    }
  }

  console.log("\n── Automation 'LINK — Birthday Reading' ──");
  const automation = await prisma.automation.findFirst({
    where: { name: "LINK — Birthday Reading" },
    include: { trackedLinks: true, instagramAccount: true },
  });
  if (!automation) {
    console.log("(missing!)");
  } else {
    console.log(`  id:              ${automation.id}`);
    console.log(`  isActive:        ${automation.isActive}`);
    console.log(`  dmTriggerEnabled:${automation.dmTriggerEnabled}`);
    console.log(`  requireFollow:   ${automation.requireFollow}`);
    console.log(`  openingDmEnabled:${automation.openingDmEnabled}`);
    console.log(`  followUpEnabled: ${automation.followUpEnabled}`);
    console.log(`  dmMessage:       ${(automation.dmMessage ?? "").slice(0, 160)}`);
    console.log(`  linkButtonLabel: ${automation.linkButtonLabel ?? "(none)"}`);
    console.log(`  trackedLinks:    ${automation.trackedLinks.length} row(s)`);
    for (const t of automation.trackedLinks) {
      console.log(`    - ${t.slug} -> ${t.destinationUrl}`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("Check failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });