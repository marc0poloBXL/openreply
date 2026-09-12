// check-fb-app.mjs — Check what the FB App has configured
const FB_APP_ID = "1051360407668084";
const FB_APP_SECRET = "b2708ce0c790783fbf27c0dfcc0e1459";
const token = `${FB_APP_ID}|${FB_APP_SECRET}`;

async function call(method, url) {
  const r = await fetch(url, { method });
  const text = await r.text();
  try { const j = JSON.parse(text); console.log('Response:', JSON.stringify(j, null, 2)); return j; } catch { console.log('Raw:', text.substring(0,300)); return { raw: text.substring(0, 300) }; }
}

async function main() {
  // Check FB App details
  console.log("=== FB App ===");
  const r1 = await call("GET", `https://graph.facebook.com/v21.0/${FB_APP_ID}?fields=id,name,app_type,category,link,supported_platforms,roles&access_token=${encodeURIComponent(token)}`);
  console.log(JSON.stringify(r1.body, null, 2));

  // Check what products are in the app
  console.log("\n=== App products ===");
  const r2 = await call("GET", `https://graph.facebook.com/v21.0/${FB_APP_ID}?fields=id,name,app_domains,webhooks_messaging_ig_app,webhooks_messaging_app&access_token=${encodeURIComponent(token)}`);
  console.log(JSON.stringify(r2.body, null, 2));

  // Try getting the app's Instagram Business Login config
  console.log("\n=== App Instagram config ===");
  const r3 = await call("GET", `https://graph.facebook.com/v21.0/${FB_APP_ID}/instagram_basic?access_token=${encodeURIComponent(token)}`);
  console.log(JSON.stringify(r3.body, null, 2));
}
main().catch(e => console.error(e.message));