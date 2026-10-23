/**
 * TEMP (never committed): Unsubscribe mystery app, then subscribe app 1051.
 *
 * FIXED v2: Uses the CURRENT app ID from GET, not the stale hardcoded constant.
 * Strategy:
 *   1. Read IGAA token from DB
 *   2. GET current subscribed_apps → capture the actual current app ID
 *   3. DELETE with that actual ID
 *   4. POST to subscribe app 1051
 *   5. GET to verify
 *
 * Run: npx tsx prisma/_tmp-unsubscribe-and-resubscribe.ts
 * Prints no secrets.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { decryptToken } from "../lib/meta/oauth";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

const IG_ID = "17841438935909153";
const APP_1051 = "1051360407668084";
const VERSION = process.env.META_GRAPH_API_VERSION ?? "v25.0";
const SUBSCRIBED_FIELDS = ["comments", "messages", "messaging_optins", "mentions"];
const BASE_URL = "https://graph.instagram.com";

function prefix(s: string): string {
  return s.length > 8 ? s.slice(0, 8) + "..." : s;
}

async function getSubscribedApps(token: string): Promise<Array<{ id: string; name?: string }> | null> {
  const url = `${BASE_URL}/${VERSION}/${IG_ID}/subscribed_apps`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json() as { data?: Array<{ id: string; name?: string }>; error?: { message?: string } };
  if (res.ok && Array.isArray(body.data)) return body.data;
  console.log(`  GET failed: HTTP ${res.status} — ${body.error?.message ?? JSON.stringify(body).slice(0, 200)}`);
  return null;
}

async function main() {
  // ── 1) Read token from DB ──
  console.log("=== 1) Reading InstagramAccount from DB ===");
  const account = await prisma.instagramAccount.findUnique({
    where: { instagramId: IG_ID },
  });
  if (!account) {
    console.log("❌ No InstagramAccount row found.");
    await prisma.$disconnect();
    return;
  }
  const token = decryptToken(account.accessToken);
  console.log(`✅ Token prefix: ${prefix(token)}`);

  // ── 2) Check current state ──
  console.log("\n=== 2) Current subscribed_apps ===");
  let current = await getSubscribedApps(token);
  if (!current) { await prisma.$disconnect(); return; }

  const existingIds = current.map(a => a.id);
  const has1051 = current.some(a => a.id === APP_1051);

  if (has1051) {
    console.log("\n✅ App 1051 is already subscribed! No action needed.");
    console.log("   Next step: remove WEBHOOK_BYPASS_SIGNATURE from Vercel and verify.");
    await prisma.$disconnect();
    return;
  }

  if (current.length === 0) {
    console.log("  (none) — skipping DELETE, jumping straight to POST.");
  } else {
    for (const app of current) {
      console.log(`  id=${app.id} name=${app.name ?? "(no name)"}`);
    }

    // ── 3) DELETE using the ACTUAL current app ID ──
    console.log("\n=== 3) Deleting current subscription(s) ===");

    // 3a) For each currently-subscribed app ID, try named DELETE
    for (const app of current) {
      const url = new URL(`${BASE_URL}/${VERSION}/${IG_ID}/subscribed_apps`);
      url.searchParams.set("subscribed_app", app.id);
      console.log(`  DELETE with subscribed_app=${app.id}`);
      const res = await fetch(url.toString(), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json() as Record<string, unknown>;
      if (res.ok) {
        console.log(`  ✅ HTTP ${res.status} — ${JSON.stringify(body).slice(0, 200)}`);
      } else {
        const err = body.error as { code?: number; message?: string; type?: string } | undefined;
        console.log(`  ❌ HTTP ${res.status} — ${err ? `${err.type} ${err.code}: ${err.message}` : JSON.stringify(body).slice(0, 200)}`);
      }
    }

    // 3b) Verify if DELETE cleared the subscription(s)
    current = await getSubscribedApps(token);
    if (!current) { await prisma.$disconnect(); return; }

    if (current.length > 0) {
      // Named DELETE didn't work (wrong token). Try bare DELETE (no params)
      // which unsubscribes the calling app (app 1051) — may do nothing
      // since 1051 isn't subscribed, but worth trying.
      console.log("\n  Apps still present after named DELETEs. Trying bare DELETE (no params)...");
      const url = `${BASE_URL}/${VERSION}/${IG_ID}/subscribed_apps`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json() as Record<string, unknown>;
      if (res.ok) {
        console.log(`  ✅ DELETE (no params) succeeded: HTTP ${res.status}`);
      } else {
        const err = body.error as { code?: number; message?: string; type?: string } | undefined;
        console.log(`  ❌ DELETE (no params) failed: HTTP ${res.status} — ${err ? `${err.type} ${err.code}: ${err.message}` : JSON.stringify(body).slice(0, 200)}`);
      }

      // Re-check
      current = await getSubscribedApps(token);
      if (!current) { await prisma.$disconnect(); return; }
      if (current.length > 0) {
        console.log("\n  ⚠️  Apps still present after all DELETE attempts.");
        console.log("  The token may not have permission to unsubscribe the other app.");
        console.log("  Current apps:");
        for (const app of current) {
          console.log(`    id=${app.id} name=${app.name ?? "(no name)"}`);
        }
      } else {
        console.log("✅ All subscriptions cleared.");
      }
    } else {
      console.log("✅ All subscriptions cleared.");
    }
  }

  // ── 4) POST to subscribe app 1051 ──
  console.log("\n=== 4) Subscribing app 1051 ===");
  const postUrl = new URL(`${BASE_URL}/${VERSION}/${IG_ID}/subscribed_apps`);
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
    console.log(`✅ POST succeeded: HTTP ${postRes.status}`);
    console.log(`  Response: ${JSON.stringify(postBody).slice(0, 300)}`);
  } else {
    const err = postBody.error as { code?: number; message?: string; type?: string } | undefined;
    console.log(`❌ POST failed: HTTP ${postRes.status}`);
    if (err) console.log(`  ${err.type} ${err.code}: ${err.message}`);
    else console.log(`  ${JSON.stringify(postBody).slice(0, 300)}`);
  }

  // ── 5) Verify ──
  console.log("\n=== 5) Verification ===");
  const final = await getSubscribedApps(token);

  if (final && final.length > 0) {
    const has1051 = final.some(a => a.id === APP_1051);
    for (const app of final) {
      const tag = app.id === APP_1051 ? " ✅ APP 1051 ✅" : "";
      console.log(`  id=${app.id} name=${app.name ?? "(no name)"}${tag}`);
    }

    if (has1051) {
      console.log("\n🎯 SUCCESS! App 1051 owns the subscription!");
    } else {
      console.log("\n⚠️  App 1051 still not subscribed. POST returned success but didn't work.");
      console.log("   This suggests the token/app can't claim the subscription.");
      console.log("   Current apps:", final.map(a => a.id).join(", "));
    }
  } else if (final && final.length === 0) {
    console.log("  (none)");
    console.log("\n⚠️  No apps subscribed after POST. The subscription may require a Page token");
    console.log("   via graph.facebook.com instead of graph.instagram.com.");
  }

  // ── Summary ──
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  if (final) {
    const has1051 = final.some(a => a.id === APP_1051);
    if (has1051) {
      console.log("✅ App 1051 subscribed. Remove WEBHOOK_BYPASS_SIGNATURE from Vercel.");
    } else if (final.length === 0) {
      console.log("⚠️  No apps subscribed.");
      console.log("   Next: try subscribing via graph.facebook.com with a Page token.");
    } else {
      const otherIds = final.filter(a => a.id !== APP_1051).map(a => a.id).join(", ");
      console.log(`⚠️  App 1051 NOT subscribed. Other app(s) present: ${otherIds}`);
      console.log("   The IGAA token can't control subscriptions from other apps.");
      console.log("   Options:");
      console.log("   A. Find the mystery app's own token via Business Manager → unlink its app");
      console.log("   B. Create a new IG Business account to start fresh");
      console.log("   C. Try subscribed_apps via graph.facebook.com with a Page token");
    }
  }

  await prisma.$disconnect();
}

main();