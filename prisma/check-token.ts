/**
 * Read-only verification that the fresh IGAA token landed in the
 * (new) database after the "Connect Instagram" OAuth flow.
 *
 * Prints only non-secret fields — never the token itself.
 *
 * Run: npx tsx prisma/check-token.ts
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}
const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

async function main() {
  console.log("→ Checking InstagramAccount for @stoiczodiac …\n");

  const acct = await prisma.instagramAccount.findUnique({
    where: { instagramId: "17841438935909153" },
  });

  if (!acct) {
    console.log("❌ No InstagramAccount row found for @stoiczodiac");
    return;
  }

  const tokenPresent =
    !!acct.accessToken && acct.accessToken !== "__pending_connect__";
  const expires = acct.tokenExpiresAt ? acct.tokenExpiresAt.toISOString() : null;
  const stillValid = expires ? new Date(expires).getTime() > Date.now() : false;

  console.log("  id: ", acct.id);
  console.log("  username:", acct.username);
  console.log("  token set:", tokenPresent ? "✅ YES" : "❌ NO");
  console.log("  expires:", expires, stillValid ? "(valid ✅)" : "(expired ❌)");
  console.log("  webhookSubscribed:", acct.webhookSubscribed);

  const automation = await prisma.automation.findFirst({
    where: { name: "LINK — Birthday Reading" },
  });
  console.log("\nAutomation 'LINK — Birthday Reading':", automation ? "✅ exists" : "❌ missing");
  if (automation) {
    console.log("  dmTriggerEnabled:", automation.dmTriggerEnabled);
    console.log("  isActive:", automation.isActive);
    console.log("  keywords:", automation.keywords);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("Check failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });