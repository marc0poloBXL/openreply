/**
 * Prints the RAW payload of the "empty" webhook events from today so we can
 * see what Meta actually delivered (likely the button tap in an unexpected
 * shape). Truncates any long strings. No tokens printed.
 *
 * Run: npx tsx prisma/check-empty-webhooks.ts
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL environment variable is required");
const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

async function main() {
  const dayStart = new Date("2026-10-20T00:00:00Z");
  const events = await prisma.webhookEvent.findMany({
    where: { createdAt: { gte: dayStart } },
    orderBy: { createdAt: "asc" },
  });

  for (const e of events) {
    const p = e.payload as any;
    const hasChanges = p?.entry?.some?.((en: any) => (en.changes ?? []).length > 0) ?? false;
    if (hasChanges) continue; // only the "empty" ones

    console.log(`\n════ Event ${e.id} @ ${e.createdAt.toISOString()} ════`);
    console.log(JSON.stringify(p, (k, v) =>
      typeof v === "string" && v.length > 400 ? v.slice(0, 400) + `…[${v.length}]` : v
    , 2));
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("Check failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });