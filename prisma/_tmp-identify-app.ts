/**
 * READ-ONLY probe (temp, never committed): identify the subscribed app
 * 18089980748297864 that owns @stoiczodiac's webhook subscription.
 *
 * Strategy:
 *  1. GET /{appId} with an app access token from app 1051 — may reveal name/link
 *  2. If that fails, try /{BM_ID}/apps with a system user token
 *  3. As last resort, try /{BM_ID}/client_apps
 *
 * Run: npx tsx prisma/_tmp-identify-app.ts
 * Prints no secrets.
 */

import "dotenv/config";

const MYSTERY_APP = "18089980748297864";
const BM_ID = "5180791675279566";
const APP_1051 = process.env.FACEBOOK_APP_ID ?? "1051360407668084";
const SECRET = process.env.FACEBOOK_APP_SECRET ?? "";
const VERSION = process.env.META_GRAPH_API_VERSION ?? "v25.0";

async function getAppToken(appId: string, secret: string): Promise<string | null> {
  const url = new URL (`https://graph.facebook.com/${VERSION}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("grant_type", "client_credentials");
  const res = await fetch(url.toString());
  const body = (await res.json()) as { access_token?: string; error?: unknown };
  if (!res.ok || !body.access_token) {
    console.log(`  App token failed: HTTP ${res.status} — ${JSON.stringify(body).slice(0, 200)}`);
    return null;
  }
  return body.access_token;
}

async function main() {
  console.log(`\n=== Investigating subscribed app ${MYSTERY_APP} ===\n`);

  // 1) Query the mystery app directly with app 1051's token
  const token = await getAppToken(APP_1051, SECRET);
  if (token) {
    const url = new URL(`https://graph.facebook.com/${VERSION}/${MYSTERY_APP}`);
    url.searchParams.set("access_token", token);
    url.searchParams.set("fields", "id,name,link,category,products,creator");
    const res = await fetch(url.toString());
    const body = await res.json() as Record<string, unknown>;
    if (res.ok) {
      console.log("✅ Direct app query succeeded:");
      console.log(JSON.stringify(body, null, 2));
      // If we got a name, we're done
      if (body.name) {
        console.log(`\n✅ Mystery app identified: "${body.name}" (${body.id})`);
        return;
      }
    } else {
      console.log(`Direct app query: HTTP ${res.status} — ${JSON.stringify(body).slice(0, 300)}`);
    }

    // 2) Try the BM apps endpoint — maybe the app is a BM-scoped instance
    console.log("\n--- Trying Business Manager apps ---");
    const bmUrl = new URL(`https://graph.facebook.com/${VERSION}/${BM_ID}/apps`);
    bmUrl.searchParams.set("access_token", token);
    const bmRes = await fetch(bmUrl.toString());
    const bmBody = await bmRes.json() as { data?: Array<Record<string, unknown>> };
    if (bmRes.ok && Array.isArray(bmBody.data)) {
      console.log(`BM has ${bmBody.data.length} app(s):`);
      for (const app of bmBody.data) {
        const match = app.id === MYSTERY_APP ? " ⬅️ THIS IS THE MYSTERY APP" : "";
        console.log(`  - id=${app.id} name=${app.name ?? "(no name)"}${match}`);
      }
    } else {
      console.log(`BM apps: HTTP ${bmRes.status} — ${JSON.stringify(bmBody).slice(0, 300)}`);
    }

    // 3) Try /{BM_ID}/client_apps
    console.log("\n--- Trying BM client_apps ---");
    const caUrl = new URL(`https://graph.facebook.com/${VERSION}/${BM_ID}/client_apps`);
    caUrl.searchParams.set("access_token", token);
    const caRes = await fetch(caUrl.toString());
    const caBody = await caRes.json() as { data?: Array<Record<string, unknown>> };
    if (caRes.ok && Array.isArray(caBody.data)) {
      console.log(`BM has ${caBody.data.length} client app(s):`);
      for (const app of caBody.data) {
        const match = app.id === MYSTERY_APP ? " ⬅️ THIS IS THE MYSTERY APP" : "";
        console.log(`  - id=${app.id} name=${app.name ?? "(no name)"}${match}`);
      }
    } else {
      console.log(`BM client_apps: HTTP ${caRes.status} — ${JSON.stringify(caBody).slice(0, 300)}`);
    }

    // 4) Try /{BM_ID}/owned_apps
    console.log("\n--- Trying BM owned_apps ---");
    const oaUrl = new URL(`https://graph.facebook.com/${VERSION}/${BM_ID}/owned_apps`);
    oaUrl.searchParams.set("access_token", token);
    const oaRes = await fetch(oaUrl.toString());
    const oaBody = await oaRes.json() as { data?: Array<Record<string, unknown>> };
    if (oaRes.ok && Array.isArray(oaBody.data)) {
      console.log(`BM has ${oaBody.data.length} owned app(s):`);
      for (const app of oaBody.data) {
        const match = app.id === MYSTERY_APP ? " ⬅️ THIS IS THE MYSTERY APP" : "";
        console.log(`  - id=${app.id} name=${app.name ?? "(no name)"}${match}`);
      }
    } else {
      console.log(`BM owned_apps: HTTP ${oaRes.status} — ${JSON.stringify(oaBody).slice(0, 300)}`);
    }
  }

  console.log("\n=== Investigation complete ===");
}

main();