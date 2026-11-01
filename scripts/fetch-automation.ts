/**
 * Fetch the active automation(s) for the Instagram account so a test webhook
 * postback payload can target the right automation (`reveal:{AUTOMATION_ID}`).
 *
 * Same pattern as diagnose-db-state.ts: ESM imports + Prisma client TS source.
 * Run with: npx tsx scripts/fetch-automation.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../app/generated/prisma/client";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const account = await prisma.instagramAccount.findUnique({
    where: { instagramId: "17841438935909153" },
  });
  if (!account) {
    console.log("NO_ACCOUNT");
    process.exit(1);
  }
  const automations = await prisma.automation.findMany({
    where: { instagramAccountId: account.id, isActive: true },
    select: {
      id: true,
      name: true,
      dmTriggerEnabled: true,
      dmLeadMagnetEnabled: true,
    },
  });
  const result = { accountId: account.id, automations };
  console.log(JSON.stringify(result));
}

main()
  .catch((e) => {
    console.error("Script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });