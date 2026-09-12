// Try FB App token to set IG App webhook callback
const FB_TOKEN = "1051360407668084|b2708ce0c790783fbf27c0dfcc0e1459";
const IG_APP_ID = "2616058292165458";
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
  try { return JSON.parse(text); } catch { return { raw: text.substring(0, 300) }; }
}

async function main() {
  // Try FB App token to set IG App webhook
  console.log("=== FB App token → set IG App webhook ===");
  const r1 = await call("POST", `https://graph.facebook.com/v21.0/${IG_APP_ID}/subscriptions`, {
    access_token: FB_TOKEN,
    object: "instagram",
    callback_url: CALLBACK_URL,
    verify_token: VERIFY_TOKEN,
    fields: "comments,messages",
  });
  console.log(JSON.stringify(r1, null, 2));

  // Check IG App subscriptions
  console.log("\n=== Check IG App subscriptions (via FB token) ===");
  const r2 = await call("GET", `https://graph.facebook.com/v21.0/${IG_APP_ID}/subscriptions?access_token=${encodeURIComponent(FB_TOKEN)}`);
  console.log(JSON.stringify(r2, null, 2));

  // Try to subscribe IG account to FB App (not IG App)
  console.log("\n=== Subscribe IG to FB App (via FB token) ===");
  const r3 = await call("POST", `https://graph.facebook.com/v21.0/17841438935909153/subscribed_apps`, {
    access_token: FB_TOKEN,
    subscribed_fields: "comments,messages",
  });
  console.log(JSON.stringify(r3, null, 2));
}
main().catch(e => console.error(e.message));