/**
 * READ-ONLY diagnostic (temp, never committed): identify which Meta app(s)
 * own the webhook subscription for @stoiczodiac.
 *
 * GET /{ig-id}/subscribed_apps with the decrypted IGAA token.
 * App IDs returned = the apps Meta signs webhook deliveries with.
 *
 * Run: npx tsx prisma/_tmp-check-subscribed-apps.ts
 * Prints no secrets.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { decryptToken } from "../lib/meta/oauth";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL environment variable is required");
const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

const IG_INSTAGRAM_ID = "17841438935909153";
const VERSION = process.env.META_GRAPH_API_VERSION ?? "v25.0";

async function main() {
  const account = await prisma.instagramAccount.findUnique({
    where: { instagramId: IG_INSTAGRAM_ID },
  });
  if (!account) {
    console.log("❌ No InstagramAccount row found for @stoiczodiac");
    return;
  }

  const token = decryptToken(account.accessToken);
  console.log("Token prefix:", token.slice(0, 4) + "...");

  const url = `https://graph.instagram.com/${VERSION}/${IG_INSTAGRAM_ID}/subscribed_apps`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log("HTTP", res.status);
  const body = await res.json();
  if (res.ok) {
    const apps = Array.isArray(body.data) ? body.data : [];
    console.log(`Subscribed app(s): ${apps.length}`);
    for (const app of apps) {
      console.log(`  - id=${app.id} name=${app.name ?? "(no name)"}`);
    }
  } else {
    console.log("Response:", JSON.stringify(body).slice(0, 400));
  }
}

main().finally(() => prisma.$disconnect());