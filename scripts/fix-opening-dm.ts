/**
 * Fix the openingDmMessage text so it invites the user to tap the button
 * instead of sounding like the reading is already delivered.
 *
 * DB-only change — no code edit, no PM2 restart needed.
 * Worker reads config from DB at every job.
 *
 * Run with: npx tsx --env-file=.env scripts/fix-opening-dm.ts
 * (or the standard 8.3 short-path fallback)
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../app/generated/prisma/client";

const AUTOMATION_ID = "cmvgycede0004b8vew43xmmh1";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. Read current value
  const before = await prisma.automation.findUnique({
    where: { id: AUTOMATION_ID },
    select: { id: true, name: true, openingDmMessage: true },
  });
  if (!before) {
    console.error(`Automation ${AUTOMATION_ID} not found`);
    process.exit(1);
  }

  console.log("=== AVANT ===");
  console.log(`  "${before.name}"`);
  console.log(`  openingDmMessage: ${JSON.stringify(before.openingDmMessage)}`);

  // 2. Update with button-inviting text (English — Marc's request 28 Oct)
  const NEW_TEXT =
    "Hey {username}! Thanks for your interest. If you want to discover your free reading: press the button and input your zodiac sign!";

  const updated = await prisma.automation.update({
    where: { id: AUTOMATION_ID },
    data: { openingDmMessage: NEW_TEXT },
    select: { id: true, name: true, openingDmMessage: true },
  });

  console.log("\n=== APRÈS ===");
  console.log(`  "${updated.name}"`);
  console.log(`  openingDmMessage: ${JSON.stringify(updated.openingDmMessage)}`);
  console.log("\n✅ Fix appliqué !");
  console.log("   Le worker relit la config depuis la DB à chaque job → pas de restart PM2 nécessaire.");
}

main()
  .catch((e) => {
    console.error("Script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });