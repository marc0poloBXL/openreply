/**
 * One-command webhook re-subscription for @stoiczodiac.
 *
 * Sends POST /{ig-id}/subscribed_apps with the stored token (Page token when
 * available, otherwise IGAA) including messaging_postbacks, then marks the
 * account webhookSubscribed. Run after deploying the updated subscription
 * fields so button taps ("Get My Reading") are delivered again.
 *
 * Prints no secrets. Run: npx tsx prisma/resubscribe-webhooks.ts
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { decryptToken } from "../lib/meta/oauth";
import { subscribeInstagramAccountToWebhooks } from "../lib/meta/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL environment variable is required");
const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

async function main() {
  const IG_INSTAGRAM_ID = "17841438935909153";

  const account = await prisma.instagramAccount.findUnique({
    where: { instagramId: IG_INSTAGRAM_ID },
  });
  if (!account) {
    console.log("❌ No InstagramAccount row found for @stoiczodiac");
    return;
  }

  const token = account.pageToken
    ? decryptToken(account.pageToken)
    : decryptToken(account.accessToken);

  const result = await subscribeInstagramAccountToWebhooks(account.instagramId, token);
  if (result.success) {
    await prisma.instagramAccount.update({
      where: { id: account.id },
      data: { webhookSubscribed: true },
    });
    console.log("✅ Webhooks re-subscribed (comments, messages, messaging_postbacks)");
    console.log("   webhookSubscribed set to true");
  } else {
    console.log("❌ Subscription request failed (see error above)");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("Resubscribe failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });