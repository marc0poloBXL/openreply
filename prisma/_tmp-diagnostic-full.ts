/**
 * TEMP (never committed): Comprehensive diagnostic — run inside project dir.
 *
 * Checks:
 *   1. pageToken existence in InstagramAccount row
 *   2. app token for app 1051 via client_credentials
 *   3. debug_token — which app issued the stored IGAA/Page token?
 *   4. Current subscribed_apps via graph.instagram.com (IGAA token)
 *   5. Current subscribed_apps via graph.facebook.com (Page token, if available)
 *
 * Run: npx tsx prisma/_tmp-diagnostic-full.ts
 * Prints no secrets (only prefixes).
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { decryptToken } from "../lib/meta/oauth";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL environment variable is required");
const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

const IG_ID = "17841438935909153";
const APP_1051 = process.env.FACEBOOK_APP_ID ?? "1051360407668084";
const SECRET = process.env.FACEBOOK_APP_SECRET ?? "";
const VERSION = process.env.META_GRAPH_API_VERSION ?? "v25.0";
const SUBSCRIBED_FIELDS = ["comments", "messages", "messaging_optins", "mentions"];

function prefix(s: string): string {
  return s.length > 8 ? s.slice(0, 8) + "..." : s;
}

async function getAppToken(): Promise<string | null> {
  const url = new URL(`https://graph.facebook.com/${VERSION}/oauth/access_token`);
  url.searchParams.set("client_id", APP_1051);
  url.searchParams.set("client_secret", SECRET);
  url.searchParams.set("grant_type", "client_credentials");
  const res = await fetch(url.toString());
  const body = (await res.json()) as { access_token?: string; error?: unknown };
  if (!res.ok || !body.access_token) {
    console.log(`  client_credentials failed: HTTP ${res.status}`);
    return null;
  }
  return body.access_token;
}

async function debugToken(inputToken: string, appToken: string): Promise<void> {
  const debugRes = await fetch(
    `https://graph.facebook.com/debug_token?input_token=${inputToken}&access_token=${appToken}`
  );
  const debugBody = (await debugRes.json()) as {
    data?: {
      app_id?: string;
      application?: string;
      is_valid?: boolean;
      expires_at?: number;
      scopes?: string[];
      type?: string;
      granular_scopes?: Array<{ scope: string }>;
    };
    error?: { message?: string };
  };
  if (debugBody.error) {
    console.log(`  debug_token error: ${debugBody.error.message}`);
    return;
  }
  const d = debugBody.data;
  if (!d) {
    console.log(`  debug_token returned no data`);
    return;
  }
  const issuerLabel = d.app_id === APP_1051 ? "✅ APP 1051" : `⚠️ unknown app ${d.app_id}`;
  const expiry = d.expires_at
    ? new Date(d.expires_at * 1000).toISOString()
    : "never";
  const gScopes = d.granular_scopes?.map(g => g.scope).join(", ") ?? "(none)";
  console.log(`  Issuer  : ${issuerLabel} (app_id=${d.app_id})`);
  console.log(`  App name: ${d.application ?? "(not shown)"}`);
  console.log(`  Valid   : ${d.is_valid}`);
  console.log(`  Expires : ${expiry}`);
  console.log(`  Type    : ${d.type}`);
  console.log(`  Scopes  : ${(d.scopes ?? []).join(", ") || "(none)"}`);
  console.log(`  Granular: ${gScopes}`);
}

async function checkSubscribedApps(token: string, label: string, baseUrl: string): Promise<void> {
  console.log(`\n--- subscribed_apps via ${label} ---`);
  // GET
  const getUrl = `https://${baseUrl}/${VERSION}/${IG_ID}/subscribed_apps`;
  let getRes = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let getBody = await getRes.json() as { data?: Array<{ id: string; name?: string }>; error?: { message?: string } };
  if (getRes.ok && Array.isArray(getBody.data)) {
    if (getBody.data.length === 0) {
      console.log("  (none)");
    }
    for (const app of getBody.data) {
      const tag = app.id === APP_1051 ? " ✅ APP 1051" : app.id === "18089980748297864" ? " ⬅️ mystery app" : "";
      console.log(`  id=${app.id} name=${app.name ?? "(no name)"}${tag}`);
    }
  } else {
    console.log(`  GET failed: HTTP ${getRes.status} — ${getBody.error?.message ?? "unknown"}`);
    return; // don't POST if we can't even GET
  }

  // POST — attempt subscription to app 1051
  console.log("  --- Attempting POST /subscribed_apps ---");
  const postUrl = new URL(getUrl);
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
    console.log(`  ✅ POST succeeded: ${JSON.stringify(postBody).slice(0, 200)}`);
    // Verify
    const verifyRes = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const verifyBody = await verifyRes.json() as { data?: Array<{ id: string; name?: string }> };
    if (verifyRes.ok && Array.isArray(verifyBody.data)) {
      let has1051 = false;
      for (const app of verifyBody.data) {
        const tag = app.id === APP_1051 ? " ✅ APP 1051" : "";
        if (app.id === APP_1051) has1051 = true;
        console.log(`  After POST: id=${app.id} name=${app.name ?? "(no name)"}${tag}`);
      }
      if (has1051) {
        console.log(`\n✅✅✅ APP 1051 IS SUBSCRIBED via ${label}!`);
      } else {
        console.log(`\n⚠️ App 1051 NOT subscribed via ${label} despite successful POST`);
      }
    }
  } else {
    const err = postBody.error as { code?: number; message?: string; type?: string } | undefined;
    console.log(`  ❌ POST failed: HTTP ${postRes.status}${err ? ` — ${err.type} ${err.code}: ${err.message}` : ""}`);
  }
}

async function main() {
  // ====== 1) InstagramAccount row ======
  console.log("=== 1) InstagramAccount row ===");
  const account = await prisma.instagramAccount.findUnique({
    where: { instagramId: IG_ID },
  });
  if (!account) {
    console.log("❌ No InstagramAccount row found for @stoiczodiac");
    return;
  }
  console.log(`✅ Found: instagramId=${account.instagramId} username=${account.username ?? "(not set)"}`);

  // IGAA token
  const igaaToken = decryptToken(account.accessToken);
  console.log(`   IGAA token prefix: ${prefix(igaaToken)}`);

  // Page token
 if (account.pageToken) {
    const pageToken = decryptToken(account.pageToken);
    console.log(`   Page token prefix: ${prefix(pageToken)} (EA/...)`);
  } else {
    console.log(`   Page token: MISSING from database`);
  }

  // ====== 2) App token for 1051 ======
  console.log("\n=== 2) App token for app 1051 ===");
  const appToken = await getAppToken();
  if (!appToken) {
    console.log("❌ Cannot get app token — aborting.");
    await prisma.$disconnect();
    return;
  }
  console.log("✅ App token obtained");

  // ====== 3) debug_token on IGAA token ======
  console.log("\n=== 3) debug_token — IGAA token issuer ===");
  await debugToken(igaaToken, appToken);

  // ====== 4) debug_token on Page token (if available) ======
  if (account.pageToken) {
    const pageToken = decryptToken(account.pageToken);
    console.log("\n=== 4) debug_token — Page token issuer ===");
    await debugToken(pageToken, appToken);
  }

  // ====== 5) subscribed_apps via graph.instagram.com (with IGAA token) ======
  console.log("\n=== 5) graph.instagram.com path (IGAA token) ===");
  await checkSubscribedApps(igaaToken, "graph.instagram.com (IGAA)", "graph.instagram.com");

  // ====== 6) subscribed_apps via graph.facebook.com (with Page token, if available) ======
  if (account.pageToken) {
    const pageToken = decryptToken(account.pageToken);
    console.log("\n=== 6) graph.facebook.com path (Page token) ===");
    await checkSubscribedApps(pageToken, "graph.facebook.com (Page)", "graph.facebook.com");
  }

  console.log("\n=== Diagnostic complete ===");
}

main().finally(() => prisma.$disconnect());