/**
 * READ-ONLY probe (temp, never committed): check app 1051 "stoiczodiac-dm"
 * (FACEBOOK_APP_ID in .env) so we know whether the www.instagram.com OAuth
 * flow can redirect back to our callback:
 *   https://openreply-zeta-ruby.vercel.app/api/instagram/callback
 *
 * Run: npx tsx prisma/_tmp-probe-app1051.ts
 * Prints NO secret values (app access token stays in the query string only).
 */

import "dotenv/config";

const VERSION = process.env.META_GRAPH_API_VERSION ?? "v25.0";
const APP_ID = process.env.FACEBOOK_APP_ID ?? ""; // app 1051
const SECRET = process.env.FACEBOOK_APP_SECRET ?? "";
const CALLBACK = "https://openreply-zeta-ruby.vercel.app/api/instagram/callback";

async function main() {
  // 1) App access token (app_id|app_secret) — never logged.
  const turl = new URL(`https://graph.facebook.com/${VERSION}/oauth/access_token`);
  turl.searchParams.set("client_id", APP_ID);
  turl.searchParams.set("client_secret", SECRET);
  turl.searchParams.set("grant_type", "client_credentials");
  const tres = await fetch(turl.toString());
  const tbody = (await tres.json()) as { access_token?: string; error?: unknown };
  if (!tres.ok || !tbody.access_token) {
    console.log(`client_credentials for app ${APP_ID}: HTTP ${tres.status} — ${JSON.stringify(tbody).slice(0, 200)}`);
    return;
  }
  console.log(`App token OK for app ${APP_ID}`);

  // 2) Probe endpoints that reveal OAuth redirect URI configuration.
  const probes: Array<[string, string]> = [
    ["App object", `${APP_ID}?fields=id,name,category,link,products`],
    ["/redirect_uris", `${APP_ID}/redirect_uris`],
    ["/instagram_oauth_redirect_uris", `${APP_ID}/instagram_oauth_redirect_uris`],
  ];
  for (const [label, path] of probes) {
    const u = new URL(`https://graph.facebook.com/${VERSION}/${path}`);
    u.searchParams.set("access_token", tbody.access_token);
    const res = await fetch(u.toString());
    const body = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      console.log(`${label}: HTTP ${res.status} — ${JSON.stringify(body).slice(0, 220)}`);
      continue;
    }
    const data = JSON.stringify(body, (k, v) => (k === "access_token" ? "…" : v));
    console.log(`${label}: ${data.slice(0, 700)}`);
    // flag if our callback appears anywhere
    if (JSON.stringify(body).includes(CALLBACK)) {
      console.log(`  ✅ Callback ${CALLBACK} is listed for app ${APP_ID}`);
    } else if (label !== "App object") {
      console.log(`  ⚠️  Callback ${CALLBACK} NOT found in ${label}`);
    }
  }
}

main();