/**
 * TEMP (never committed): Retry debug_token with backoff + investigate mystery app.
 * Tries up to 5 times with exponential backoff.
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

function prefix(s: string): string { return s.length > 8 ? s.slice(0, 8) + "..." : s; }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function getAppToken(): Promise<string | null> {
  const url = new URL(`https://graph.facebook.com/${VERSION}/oauth/access_token`);
  url.searchParams.set("client_id", APP_1051);
  url.searchParams.set("client_secret", SECRET);
  url.searchParams.set("grant_type", "client_credentials");
  const res = await fetch(url.toString());
  const body = (await res.json()) as { access_token?: string; error?: unknown };
  if (!res.ok || !body.access_token) return null;
  return body.access_token;
}

async function main() {
  console.log("=== Reading InstagramAccount ===");
  const account = await prisma.instagramAccount.findUnique({ where: { instagramId: IG_ID } });
  if (!account) { console.log("❌ No row found"); await prisma.$disconnect(); return; }
  const igaaToken = decryptToken(account.accessToken);
  console.log(`IGAA token prefix: ${prefix(igaaToken)}`);
  console.log(`Page token present: ${!!account.pageToken}`);

  console.log("\n=== Getting app token ===");
  const appToken = await getAppToken();
  if (!appToken) { console.log("❌ Failed"); await prisma.$disconnect(); return; }
  console.log("✅ App token obtained");

  // ── Retry debug_token up to 5 times ──
  console.log("\n=== debug_token — retry loop ===");
  for (let attempt = 1; attempt <= 5; attempt++) {
    console.log(`  Attempt ${attempt}...`);
    const res = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${igaaToken}&access_token=${appToken}`
    );
    const body = (await res.json()) as Record<string, unknown>;
    const err = body.error as { message?: string; code?: number; error_subcode?: number } | undefined;
    if (!err && body.data) {
      const d = body.data as {
        app_id?: string; application?: string; is_valid?: boolean;
        expires_at?: number; scopes?: string[]; type?: string;
        granular_scopes?: Array<{ scope: string }>;
      };
      const issuer = d.app_id === APP_1051 ? "✅ APP 1051" : `⚠️ OTHER: ${d.app_id}`;
      const expiry = d.expires_at ? new Date(d.expires_at * 1000).toISOString() : "never";
      console.log(`  Issuer   : ${issuer}`);
      console.log(`  App name : ${d.application ?? "(not shown)"}`);
      console.log(`  Valid    : ${d.is_valid}`);
      console.log(`  Expires  : ${expiry}`);
      console.log(`  Type     : ${d.type}`);
      console.log(`  Scopes   : ${(d.scopes ?? []).join(", ") || "(none)"}`);
      console.log(`  Granular : ${d.granular_scopes?.map(g => g.scope).join(", ") ?? "(none)"}`);
      break; // success
    }
    if (attempt < 5) {
      const delay = Math.pow(3, attempt) * 1000; // 3s, 9s, 27s, 81s
      console.log(`  ${err?.message ?? "unknown error"} — retrying in ${delay / 1000}s...`);
      await sleep(delay);
    } else {
      console.log(`  ❌ All 5 attempts failed. Last: ${err?.message ?? JSON.stringify(err)}`);
    }
  }

  // ── Try to resolve mystery app ID via graph API ──
  const MYSTERY = "18103432823297864";
  console.log(`\n=== Investigating mystery app: ${MYSTERY} ===`);
  // Try to GET the app itself via the app token (won't work for other apps but worth trying)
  const appUrl = `https://graph.facebook.com/${MYSTERY}?access_token=${appToken}`;
  const appRes = await fetch(appUrl);
  const appBody = await appRes.json() as Record<string, unknown>;
  if (appBody.error) {
    const e = appBody.error as { message?: string; code?: number };
    console.log(`  Direct lookup: ${e.code} ${e.message?.slice(0, 120)}`);
  } else {
    console.log(`  Direct lookup result: ${JSON.stringify(appBody).slice(0, 200)}`);
  }

  // Check if app 1051's app-scoped user exists
  console.log(`\n=== App-scoped user lookup via app 1051 ==`);
  const asuidUrl = `https://graph.facebook.com/${VERSION}/me?access_token=${appToken}&fields=id,name`;
  const asuidRes = await fetch(asuidUrl);
  const asuidBody = await asuidRes.json() as Record<string, unknown>;
  if (asuidBody.id) {
    console.log(`  App-scoped user ID: ${asuidBody.id}`);
  } else {
    console.log(`  App-scoped user: ${JSON.stringify(asuidBody).slice(0, 150)}`);
  }

  await prisma.$disconnect();
}

main();