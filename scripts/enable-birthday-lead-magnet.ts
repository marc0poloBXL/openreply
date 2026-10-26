/**
 * Enable dmLeadMagnetEnabled on the "LINK — Birthday Reading" automation for @stoiczodiac.
 *
 * Usage: npx tsx --env-file=.env scripts/enable-birthday-lead-magnet.ts
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../app/generated/prisma/client";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const automation = await prisma.automation.findFirst({
    where: {
      instagramAccount: { username: "stoiczodiac" },
      name: { contains: "Birthday" },
    },
  });

  if (!automation) {
    console.log("❌ Birthday Reading automation not found for @stoiczodiac");
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log("Found:", automation.id, automation.name);
  console.log("  dmLeadMagnetEnabled was:", automation.dmLeadMagnetEnabled);
  console.log("  dmTriggerEnabled is:", automation.dmTriggerEnabled);
  console.log("  isActive is:", automation.isActive);

  const updated = await prisma.automation.update({
    where: { id: automation.id },
    data: { dmLeadMagnetEnabled: true },
  });

  console.log("✅ dmLeadMagnetEnabled is now:", updated.dmLeadMagnetEnabled);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Script failed:", e);
  process.exit(1);
});