/**
 * Dump the FULL raw payloads of the most recent webhook events, unclassified,
 * to see exactly what Meta delivered (changes[] vs legacy messaging[], dm_id,
 * text presence). Slice each payload to keep output bounded.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../app/generated/prisma/client";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const webhooks = await prisma.webhookEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  for (const w of webhooks) {
    console.log(`\n=== ${w.createdAt.toISOString()}  status=${w.status} ===`);
    console.log(JSON.stringify(w.payload, null, 2).slice(0, 2500));
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