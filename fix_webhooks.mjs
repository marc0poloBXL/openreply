// fix_webhooks.mjs — Set up Instagram App webhook programmatically
const IG_APP_ID = '2616058292165458';
const FB_APP_ID = '1051360407668084';
const FB_APP_SECRET = 'b2708ce0c790783fbf27c0dfcc0e1459';
const CALLBACK_URL = 'https://openreply-zeta-ruby.vercel.app/api/webhook';
const VERIFY_TOKEN = 'stoiczodiac-webhook-2026';
const IG_ID = '17841438935909153';
const PAGE_ID = '1229304876940609';
const BM_ID = '2052016095704629';

const USER_TOKEN = process.argv[2] || 'EAAO8NOuhRXQBSSnKot3LTPhFYiT8LSFplNLB1iuJsVwCGbbTHTtRNuTY07JnD5OZBe4CZC9s5ZBmdRjAkOFujk4aceocfPNgYzR3hGnt9ZAjBohpywRxy1HxAQL4oGWwDHbjPGmbIjTI15IhGLTZCAEQIDKd2WA3ARDhoyO5OW9h5CwE2wyuYz3Oy69ViB7ZBmpbAoX03Y8iUU0ZCrEpvhlG67mA6h3vARucnSp5C0NTmMPNirVZBXMFpQaZBXjbUA178VkUnCLdJBR4J6ZASymbZCy';

async function call(method, url, body, form) {
  const opts = { method, headers: {} };
  if (form) {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(body).toString();
  } else if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: r.status, body: json };
}

async function main() {
  console.log('=== 1. Check if user token can access Instagram App ===');
  let r = await call('GET', `https://graph.facebook.com/v26.0/${IG_APP_ID}?fields=id,name&access_token=${USER_TOKEN}`);
  console.log(JSON.stringify(r.body, null, 2));

  console.log('\n=== 2. Set Instagram App webhook subscription ===');
  r = await call('POST', `https://graph.facebook.com/v26.0/${IG_APP_ID}/subscriptions`, {
    object: 'instagram',
    callback_url: CALLBACK_URL,
    verify_token: VERIFY_TOKEN,
    fields: 'comments,messages',
    access_token: USER_TOKEN
  }, true);
  console.log(JSON.stringify(r.body, null, 2));

  console.log('\n=== 3. Subscribe IG to FB App (app token) ===');
  const fbAppToken = `${FB_APP_ID}|${FB_APP_SECRET}`;
  r = await call('POST', `https://graph.facebook.com/v26.0/${IG_ID}/subscribed_apps`, {
    access_token: fbAppToken,
    subscribed_fields: 'comments,messages'
  });
  console.log(JSON.stringify(r.body, null, 2));

  console.log('\n=== 4. Try Business Manager IG link ===');
  r = await call('GET', `https://graph.facebook.com/v26.0/${BM_ID}/instagram_accounts?fields=id,username,profile_picture_url&access_token=${USER_TOKEN}`);
  console.log(JSON.stringify(r.body, null, 2));

  console.log('\n=== 5. Try BM claimed_instagram_accounts ===');
  r = await call('GET', `https://graph.facebook.com/v26.0/${BM_ID}?fields=name,instagram_accounts{id,username}&access_token=${USER_TOKEN}`);
  console.log(JSON.stringify(r.body, null, 2));

  console.log('\n=== 6. Try owned_instagram_accounts (BM edge) ===');
  r = await call('GET', `https://graph.facebook.com/v26.0/${BM_ID}/owned_instagram_accounts?fields=id,username&access_token=${USER_TOKEN}`);
  console.log(JSON.stringify(r.body, null, 2));

  console.log('\n=== 7. Check app-level webhook fields ===');
  r = await call('GET', `https://graph.facebook.com/v26.0/${FB_APP_ID}/subscriptions?access_token=${fbAppToken}`);
  const subs = r.body.data || [];
  for (const sub of subs) {
    if (sub.object === 'instagram') {
      console.log('Instagram subscription:', JSON.stringify(sub, null, 2));
    }
  }
}

main().catch(e => console.error(e.message));