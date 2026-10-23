/**
 * TEMP (never committed): Re-subscribe @stoiczodiac's IG user to app 1051's
 * webhooks so Meta signs deliveries with app 1051's secret.
 *
 * POST /{ig-id}/subscribed_apps with the IGAA token. If the token was issued
 * by app 1051, this adds app 1051 as a subscriber, and Meta uses that app's
 * secret for HMAC signing of webhook payloads.
 *
 * Run: npx tsx prisma/_tmp-resubscribe.ts
 * Prints no secrets.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { decryptToken } from "../lib/meta/oauth";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL environment variable is required");
const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

const IG_ID = "17841438935909153";
// We want app 1051 to own the subscription
const APP_1051 = "1051360407668084";
const VERSION = process.env.META_GRAPH_API_VERSION ?? "v25.0";
const SUBSCRIBED_FIELDS = ["comments", "messages", "messaging_optins", "mentions"];

async function main() {
  const account = await prisma.instagramAccount.findUnique({
    where: { instagramId: IG_ID },
  });
  if (!account) {
    console.log("❌ No InstagramAccount row found for @stoiczodiac");
    return;
  }

  const token = decryptToken(account.accessToken);
  const tokenPrefix = token.slice(0, 4);
  console.log(`Token prefix: ${tokenPrefix}...`);

  // 1) Debug the token first — which app issued it?
  // Use app 1051's app token for debug_token
  const appTokenRes = await fetch(
    `https://graph.facebook.com/${VERSION}/oauth/access_token?client_id=${APP_1051}&client_secret=${process.env.FACEBOOK_APP_SECRET}&grant_type=client_credentials`
  );
  const appTokenBody = await appTokenRes.json() as { access_token?: string };
  if (appTokenBody.access_token) {
    const debugRes = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${appTokenBody.access_token}`
    );
    const debugBody = await debugRes.json() as { data?: { app_id?: string; is_valid?: boolean; expires_at?: number; scopes?: string[] } };
    if (debugBody.data) {
      const d = debugBody.data;
      const issuerLabel = d.app_id === APP_1051 ? "✅ app 1051" : `⚠️ app ${d.app_id}`;
      const expiry = d.expires_at
        ? new Date((d.expires_at ?? d.expires_at) * 1000).toISOString()
        : "never";
      console.log(`Token issued by: ${issuerLabel}`);
      console.log(`  valid=${d.is_valid} scopes: ${(d.scopes ?? []).slice(0, 10).join(", ")}`);
    }
  }

  // 2) Check current subscribed_apps
  console.log("\n--- Current subscribed_apps ---");
  const getUrl = `https://graph.instagram.com/${VERSION}/${IG_ID}/subscribed_apps`;
  let getRes = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let getBody = await getRes.json() as { data?: Array<{ id: string; name?: string }>; error?: { message?: string; code?: number; type?: string } };
  if (getRes.ok && Array.isArray(getBody.data)) {
    if (getBody.data.length === 0) {
      console.log("  (none — IG user has no subscribed apps)");
    }
    for (const app of getBody.data) {
      const is1051 = app.id === APP_1051 ? " ✅ THIS IS APP 1051!" : "";
      const isMystery = app.id === "18089980748297864" ? " ⬅️ mystery app" : "";
      console.log(`  - id=${app.id} name=${app.name ?? "(no name)"}${is1051}${isMystery}`);
    }
  } else {
    const errMsg = getBody.error?.message ?? JSON.stringify(getBody).slice(0, 300);
    console.log(`GET failed: HTTP ${getRes.status} — ${errMsg}`);
  }

  // 3) Attempt to subscribe (POST)
  console.log("\n--- Attempting re-subscription to app 1051 ---");
  const postUrl = new URL(`https://graph.instagram.com/${VERSION}/${IG_ID}/subscribed_apps`);
  const postRes = await fetch(postUrl.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ subscribed_fields: SUBSCRIBED_FIELDS }),
  });
  const postBody = await postRes.json() as Record<string, unknown>;

  if (postRes.ok) {
    console.log(`✅ POST /subscribed_apps: HTTP ${postRes.status}`);
    console.log(`Response: ${JSON.stringify(postBody).slice(0, 400)}`);

    // 4) Verify
    console.log("\n--- Verifying after re-subscription ---");
    const verifyRes = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const verifyBody = await verifyRes.json() as { data?: Array<{ id: string; name?: string }> };
    if (verifyRes.ok && Array.isArray(verifyBody.data)) {
      console.log("Subscribed apps now:");
      let has1051 = false;
      for (const app of verifyBody.data) {
        const is1051 = app.id === APP_1051;
        if (is1051) has1051 = true;
        const tag = is1051 ? " ✅ APP 1051" : app.id === "18089980748297864" ? " ⬅️ mystery app" : "";
        console.log(`  - id=${app.id} name=${app.name ?? "(no name)"}${tag}`);
      }
      if (has1051) {
        console.log("\n✅ SUCCESS: App 1051 is now subscribed. Meta will sign webhooks with app 1051's secret.");
        console.log("   Next step: remove WEBHOOK_BYPASS_SIGNATURE from Vercel and verify.");
      } else {
        console.log("\n⚠️  App 1051 is NOT in the list despite successful POST. This may need investigation.");
      }
    }
  } else {
    console.log(`❌ POST /subscribed_apps: HTTP ${postRes.status}`);
    const err = postBody.error as { code?: number; message?: string; type?: string } | undefined;
    if (err) {
      console.log(`  Error: type=${err.type} code=${err.code} message=${err.message}`);
    } else {
      console.log(`  Response: ${JSON.stringify(postBody).slice(0, 500)}`);
    }

    // Analyze the error
    if (err?.code === 200 || err?.code === 100 || err?.type?.includes("OAuth")) {
      console.log("\n⚠️  Token permission issue detected.");
      console.log("   The current IGAA token was likely issued by the OLD app (2616 or mystery app).");
      console.log("   A token issued by app 1051 is needed for app 1051 to subscribe.");
      console.log("\n🔑 User needs to:");
      console.log("   1. Visit: https://openreply-zeta-ruby.vercel.app/api/auth/igaa-token");
      console.log("   2. Click '🔗 Connect Instagram' — this issues a NEW IGAA token from app 1051");
      console.log("   3. Run this script again");
    }
  }
}

main().finally(() => prisma.$disconnect());