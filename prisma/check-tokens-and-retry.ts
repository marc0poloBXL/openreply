/**
 * Diagnoses the stored tokens for @stoiczodiac WITHOUT printing any secret,
 * then retries the webhook subscription with the IGAA token (the known-good
 * path for subscribed_apps since 2026-09-10) if it is not marked expired.
 *
 * Run: npx tsx prisma/check-tokens-and-retry.ts
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { decryptToken } from "../lib/meta/oauth";
import { subscribeInstagramAccountToWebhooks } from "../lib/meta/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL environment variable is required");
const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

/** Returns only the token CLASS (IGAA / EA-Page / other) — never the token itself. */
function tokenClass(tok: string): string {
  const upper = tok.toUpperCase();
  if (upper.startsWith("IGAA")) return "IGAA";
  if (upper.startsWith("EA")) return "EA(Page)";
  return "unknown";
}

async function main() {
  const account = await prisma.instagramAccount.findUnique({
    where: { instagramId: "17841438935909153" },
  });
  if (!account) {
    console.log("❌ No InstagramAccount row found for @stoiczodiac");
    return;
  }

  console.log("username:          ", account.username);
  console.log("webhookSubscribed: ", account.webhookSubscribed);
  console.log(
    "accessToken: class=" + tokenClass(decryptToken(account.accessToken)) +
    " expiresAt=" + (account.tokenExpiresAt?.toISOString() ?? "null")
  );
  if (account.pageToken) {
    const p = decryptToken(account.pageToken);
    console.log("pageToken:  class=" + tokenClass(p) + " length=" + p.length);
  } else {
    console.log("pageToken:  none stored");
  }

  const igaa = decryptToken(account.accessToken);
  const expiresAtMs = account.tokenExpiresAt ? account.tokenExpiresAt.getTime() : null;
  const notExpired = expiresAtMs !== null && expiresAtMs > Date.now();

  if (!notExpired) {
    console.log("⚠️  IGAA token is marked expired (or no expiry stored) — skipping the API call.\n   Refresh it first (the one-click 'Connect Instagram' flow) and Fix B re-subscribes automatically.");
    return;
  }

  console.log("\nIGAA token not expired — attempting subscription with IGAA …");
  const result = await subscribeInstagramAccountToWebhooks(account.instagramId, igaa);
  if (result.success) {
    await prisma.instagramAccount.update({
      where: { id: account.id },
      data: { webhookSubscribed: true },
    });
    console.log("✅ Webhooks re-subscribed with IGAA (comments, messages, messaging_postbacks)");
    console.log("   webhookSubscribed set to true");
  } else {
    console.log("❌ Subscription with IGAA failed (see error above)");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("Failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });