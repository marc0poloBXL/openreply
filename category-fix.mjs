// category-fix.mjs — Direct API approach to fix page category
// Uses FB App token (app_id|app_secret) which has broad app-level access

const FB_APP_ID = "1051360407668084";
const FB_APP_SECRET = "b2708ce0c790783fbf27c0dfcc0e1459";
const FB_TOKEN = `${FB_APP_ID}|${FB_APP_SECRET}`;
const PAGE_ID = "1229304876940609";
const IG_ID = "17841438935909153";
const IG_BIZ_ID = "27851105327914297";
const BM_ID = "2052016095704629";
const CALLBACK_URL = "https://openreply-zeta-ruby.vercel.app/api/webhook";
const VERIFY_TOKEN = "stoiczodiac-webhook-2026";

async function call(method, url, body) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(body).toString();
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  try { return { status: r.status, body: JSON.parse(text) }; }
  catch { return { status: r.status, body: { raw: text.substring(0, 500) } }; }
}

async function main() {
  // 1. Check page info with FB app token
  console.log("=== Page info (app token) ===");
  const r1 = await call("GET", `https://graph.facebook.com/v21.0/${PAGE_ID}?fields=id,name,category,category_list&access_token=${encodeURIComponent(FB_TOKEN)}`);
  console.log(JSON.stringify(r1.body, null, 2));

  // 2. Check FB App subscriptions
  console.log("\n=== FB App subscriptions ===");
  const r2 = await call("GET", `https://graph.facebook.com/v21.0/${FB_APP_ID}/subscriptions?access_token=${encodeURIComponent(FB_TOKEN)}`);
  console.log(JSON.stringify(r2.body, null, 2));

  // 3. Try subscribing IG to FB App
  console.log("\n=== Subscribe IG to FB App ===");
  const r3 = await call("POST", `https://graph.facebook.com/v21.0/${IG_ID}/subscribed_apps`, {
    access_token: FB_TOKEN,
    subscribed_fields: "comments,messages",
  });
  console.log(JSON.stringify(r3.body, null, 2));

  // 4. Try with IG BIZ ID
  console.log("\n=== Subscribe IG BIZ to FB App ===");
  const r4 = await call("POST", `https://graph.facebook.com/v21.0/${IG_BIZ_ID}/subscribed_apps`, {
    access_token: FB_TOKEN,
    subscribed_fields: "comments,messages",
  });
  console.log(JSON.stringify(r4.body, null, 2));

  // 5. Try to set IG App webhook callback
  console.log("\n=== Set IG App webhook ===");
  const IG_APP_TOKEN = "2616058292165458|6f741ede5b48248317cc9cecd50a4ab4";
  const r5 = await call("POST", `https://graph.facebook.com/v21.0/2616058292165458/subscriptions`, {
    object: "instagram",
    callback_url: CALLBACK_URL,
    verify_token: VERIFY_TOKEN,
    fields: "comments,messages",
    access_token: IG_APP_TOKEN,
  });
  console.log(JSON.stringify(r5.body, null, 2));

  // 6. Try Business Portfolio apps
  console.log("\n=== BM Apps ===");
  const r6 = await call("GET", `https://graph.facebook.com/v21.0/${BM_ID}/apps?access_token=${encodeURIComponent(FB_TOKEN)}`);
  console.log(JSON.stringify(r6.body, null, 2));
}
main().catch(e => console.error(e.message));