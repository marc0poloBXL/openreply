/**
 * Fix the openingDmButtonLabel so it invites sign input instead of "Get My
 * Reading" (which sounds like the reading is already delivered).
 *
 * DB-only change — no code edit, no PM2 restart needed.
 * Worker reads config from DB at every job.
 *
 * Run with: npx tsx --env-file=.env scripts/fix-button-label.ts
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
    select: { id: true, name: true, openingDmButtonLabel: true },
  });
  if (!before) {
    console.error(`Automation ${AUTOMATION_ID} not found`);
    process.exit(1);
  }

  console.log("=== AVANT ===");
  console.log(`  "${before.name}"`);
  console.log(`  openingDmButtonLabel: ${JSON.stringify(before.openingDmButtonLabel)}`);

  // 2. Update to sign-input-inviting label (matches the opening DM message text).
  // Instagram truncates quick-reply button labels at 20 characters, which cut
  // "Input your zodiac sign" down to "Input your zodiac si" in the DM. Keep it
  // at 20 chars or fewer so the label renders in full.
  const NEW_LABEL = "Input your sign"; // 15 chars — renders whole

  const updated = await prisma.automation.update({
    where: { id: AUTOMATION_ID },
    data: { openingDmButtonLabel: NEW_LABEL },
    select: { id: true, name: true, openingDmButtonLabel: true },
  });

  console.log("\n=== APRÈS ===");
  console.log(`  "${updated.name}"`);
  console.log(`  openingDmButtonLabel: ${JSON.stringify(updated.openingDmButtonLabel)}`);
  console.log("\n✅ Button label fix appliqué !");
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