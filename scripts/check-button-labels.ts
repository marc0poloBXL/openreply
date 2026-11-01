/**
 * Read-only check: show every button-label field on the "LINK — Birthday
 * Reading" automation, plus the messages that reference the button.
 *
 * Pure DB read — no writes. Run with:
 *   npx tsx --env-file=.env scripts/check-button-labels.ts
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
  const a = await prisma.automation.findUnique({
    where: { id: AUTOMATION_ID },
  });
  if (!a) {
    console.error(`Automation ${AUTOMATION_ID} not found`);
    process.exit(1);
  }

  console.log(`"${a.name}" (${a.id})`);
  console.log("── Button labels ──");
  console.log("openingDmButtonLabel     :", JSON.stringify(a.openingDmButtonLabel));
  console.log("linkButtonLabel          :", JSON.stringify(a.linkButtonLabel));
  console.log("followPromptButtonLabel  :", JSON.stringify(a.followPromptButtonLabel));
  console.log("── Flags ──");
  console.log("openingDmEnabled         :", a.openingDmEnabled);
  console.log("openingDmMessage         :", JSON.stringify(a.openingDmMessage));
  console.log("requireFollow            :", a.requireFollow);
  console.log("followUpEnabled          :", a.followUpEnabled);
  console.log("dmLeadMagnetEnabled      :", a.dmLeadMagnetEnabled);
}

main()
  .catch((e) => {
    console.error("Script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });