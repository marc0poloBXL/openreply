/**
 * TEMP (never committed): Retry debug_token diagnostic.
 * Write to file & run — avoids inline execution issues.
 *
 * Run: npx tsx prisma/_tmp-diag-retry.ts
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
const APP_1051 = process.env.FACEBOOK_APP_ID ?? "1051360407668084";
const SECRET = process.env.FACEBOOK_APP_SECRET ?? "";
const VERSION = process.env.META_GRAPH_API_VERSION ?? "v25.0";

function prefix(s: string): string {
  return s.length > 8 ? s.slice(0, 8) + "..." : s;
}

async function main() {
  // 1) Read IGAA token from DB
  console.log("=== 1) Reading InstagramAccount ===");
  const account = await prisma.instagramAccount.findUnique({
    where: { instagramId: IG_ID },
  });
  if (!account) {
    console.log("No InstagramAccount row found");
    await prisma.$disconnect();
    return;
  }
  const igaaToken = decryptToken(account.accessToken);
  console.log(`IGAA token prefix: ${prefix(igaaToken)}`);
  console.log(`Page token present: ${!!account.pageToken}`);

  // 2) Get app token for app 1051
  console.log("\n=== 2) App token for app 1051 ===");
  const url = new URL(`https://graph.facebook.com/${VERSION}/oauth/access_token`);
  url.searchParams.set("client_id", APP_1051);
  url.searchParams.set("client_secret", SECRET);
  url.searchParams.set("grant_type", "client_credentials");
  const res = await fetch(url.toString());
  const body = (await res.json()) as { access_token?: string; error?: { message?: string } };
  if (!res.ok || !body.access_token) {
    console.log(`client_credentials failed: HTTP ${res.status} — ${body.error?.message ?? "unknown"}`);
    await prisma.$disconnect();
    return;
  }
  console.log("App token obtained");

  // 3) debug_token on IGAA token
  console.log("\n=== 3) debug_token — IGAA token issuer ===");
  const debugRes = await fetch(
    `https://graph.facebook.com/debug_token?input_token=${igaaToken}&access_token=${body.access_token}`
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
    error?: { message?: string; code?: number; error_subcode?: number };
  };

  if (debugBody.error) {
    console.log(`debug_token error: ${debugBody.error.message} (code=${debugBody.error.code}, subcode=${debugBody.error.error_subcode})`);
  } else if (debugBody.data) {
    const d = debugBody.data;
    const issuerLabel = d.app_id === APP_1051 ? "APP 1051" : `OTHER APP: ${d.app_id}`;
    const expiry = d.expires_at ? new Date(d.expires_at * 1000).toISOString() : "never";
    const gScopes = d.granular_scopes?.map(g => g.scope).join(", ") ?? "(none)";
    console.log(`  Issuer  : ${issuerLabel}`);
    console.log(`  App name: ${d.application ?? "(not shown)"}`);
    console.log(`  Valid   : ${d.is_valid}`);
    console.log(`  Expires : ${expiry}`);
    console.log(`  Type    : ${d.type}`);
    console.log(`  Scopes  : ${(d.scopes ?? []).join(", ") || "(none)"}`);
    console.log(`  Granular: ${gScopes}`);
  } else {
    console.log("debug_token returned no data and no error");
  }

  // 4) Check current subscribed_apps
  console.log("\n=== 4) Current subscribed_apps ===");
  const getUrl = `https://graph.instagram.com/${VERSION}/${IG_ID}/subscribed_apps`;
  const getRes = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${igaaToken}` },
  });
  const getBody = await getRes.json() as { data?: Array<{ id: string; name?: string }>; error?: { message?: string } };
  if (getRes.ok && Array.isArray(getBody.data)) {
    if (getBody.data.length === 0) {
      console.log("  (none)");
    }
    for (const app of getBody.data) {
      const tag = app.id === APP_1051 ? " APP 1051" : app.id === "18089980748297864" ? " mystery app" : "";
      console.log(`  id=${app.id} name=${app.name ?? "(no name)"}${tag}`);
    }
  } else {
    console.log(`GET failed: HTTP ${getRes.status} — ${getBody.error?.message ?? "unknown"}`);
  }

  await prisma.$disconnect();
}

main();