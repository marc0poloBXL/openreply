/**
 * READ-ONLY diagnostic (temp, never committed).
 *
 * Answers two questions that decide the webhook fix, WITHOUT printing secrets:
 *  1. Which Meta app issued the stored IGAA token and the stored Page token?
 *     (debug_token called with an app access token generated from our .env secrets)
 *  2. Do apps FACEBOOK_APP_ID / INSTAGRAM_APP_ID have an app-level Webhooks
 *     subscription, and what callback URL / verify token is configured?
 *
 * Run: npx tsx prisma/_tmp-diagnose-webhooks.ts
 * Prints NO secret values (only app ids, callback urls, expiries, scope names).
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

const FB_APP_ID = process.env.FACEBOOK_APP_ID ?? "";
const FB_SECRET = process.env.FACEBOOK_APP_SECRET ?? "";
const IG_APP_ID = process.env.INSTAGRAM_APP_ID ?? "";
const IG_SECRET = process.env.INSTAGRAM_APP_SECRET ?? "";

/** Generate an app access token (app_id|app_secret) — never logged. */
async function appToken(appId: string, secret: string): Promise<string | null> {
  const url = new URL(`https://graph.facebook.com/${VERSION}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("grant_type", "client_credentials");
  const res = await fetch(url.toString());
  const body = (await res.json()) as { access_token?: string };
  if (!res.ok || !body.access_token) {
    console.log(`  [app ${appId}] client_credentials failed HTTP ${res.status}`);
    return null;
  }
  return body.access_token;
}

/** debug_token for one input token, against a specific app access token. */
async function debugToken(appAccessToken: string, inputToken: string) {
  const url = new URL(`https://graph.facebook.com/${VERSION}/debug_token`);
  url.searchParams.set("input_token", inputToken);
  url.searchParams.set("access_token", appAccessToken);
  const res = await fetch(url.toString());
  const body = (await res.json()) as {
    data?: { app_id?: string; type?: string; expires_at?: number; scopes?: string[]; is_valid?: boolean };
  };
  return res.ok ? body.data ?? {} : { error: body };
}

/** App-level Webhooks subscriptions (callback_url, fields, verify_token). */
async function appSubscriptions(appId: string, appAccessToken: string) {
  const url = new URL(`https://graph.facebook.com/${VERSION}/${appId}/subscriptions`);
  url.searchParams.set("access_token", appAccessToken);
  const res = await fetch(url.toString());
  const body = (await res.json()) as { data?: Array<Record<string, unknown>> };
  return res.ok ? body.data ?? [] : body;
}

async function main() {
  const account = await prisma.instagramAccount.findUnique({
    where: { instagramId: IG_INSTAGRAM_ID },
  });
  if (!account) {
    console.log("❌ No InstagramAccount row found for @stoiczodiac");
    return;
  }

  const igaaToken = decryptToken(account.accessToken);
  const pageToken = account.pageToken ? decryptToken(account.pageToken) : null;
  console.log(`Account @stoiczodiac — IGAA token prefix ${igaaToken.slice(0, 4)}…${
    pageToken ? `, pageToken present (prefix ${pageToken.slice(0, 4)}…)` : ", NO pageToken in DB"
  }`);
  console.log(`webhookSubscribed flag: ${account.webhookSubscribed}`);

  for (const [label, appId, secret] of [
    [`App FACEBOOK_APP_ID (${FB_APP_ID}) — "stoiczodiac-dm"`, FB_APP_ID, FB_SECRET],
    [`App INSTAGRAM_APP_ID (${IG_APP_ID}) — IGAA exchange`, IG_APP_ID, IG_SECRET],
  ] as Array<[string, string, string]>) {
    console.log(`\n=== ${label} ===`);
    const at = await appToken(appId, secret);
    if (!at) continue;

    for (const [tname, tval] of [
      ["IGAA token", igaaToken],
      ["pageToken", pageToken],
    ] as Array<[string, string | null]>) {
      if (!tval) continue;
      const d = await debugToken(at, tval);
      if ("error" in d || !d.app_id) {
        console.log(`  ${tname}: debug_token returned no data (different app?) — ${JSON.stringify(d).slice(0, 160)}`);
        continue;
      }
      const match = d.app_id === appId ? "✅ matches this app" : `⚠️ belongs to app ${d.app_id}`;
      const expiry = d.expires_at
        ? new Date(d.expires_at * 1000).toISOString()
        : "never (long-lived / app-scoped? is_valid=" + d.is_valid + ")";
      console.log(
        `  ${tname}: app_id=${d.app_id} ${match} | valid=${d.is_valid} | expires=${expiry}\n` +
          `    scopes: ${(d.scopes ?? []).join(", ").slice(0, 200) || "(none reported)"}`
      );
      if (tname === "pageToken" && d.app_id && d.app_id !== appId) {
        console.log(`    ⚠️  pageToken was NOT issued by ${appId} — issued by ${d.app_id}`);
      }
    }

    const subs = await appSubscriptions(appId, at);
    if (Array.isArray(subs)) {
      if (subs.length === 0) console.log("  Webhooks subscriptions: NONE");
      for (const s of subs) {
        console.log(
          `  Webhook sub: object=${s.object} active=${s.active} callback_url=${s.callback_url ?? "(none)"} verify_token=${s.verify_token ?? ""} fields=${(s.fields as string[] | undefined)?.join(",") ?? ""}`
        );
      }
    } else {
      console.log(`  Webhooks query: HTTP response ${JSON.stringify(subs).slice(0, 200)}`);
    }
  }
}

main().finally(() => prisma.$disconnect());