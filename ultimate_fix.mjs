// ultimate_fix.mjs — try EVERY approach to get Instagram App webhook working
const IG_APP_ID = '2616058292165458';
const IG_APP_SECRET = '6f741ede9465e7fc28b8e601daf8dc92';
const FB_APP_ID = '1051360407668084';
const FB_APP_SECRET = 'b2708ce0c790783fbf27c0dfcc0e1459';
const CALLBACK_URL = 'https://openreply-zeta-ruby.vercel.app/api/webhook';
const VERIFY_TOKEN = 'stoiczodiac-webhook-2026';
const IG_ID = '17841438935909153';

const USER_TOKEN = process.argv[2];

async function call(method, url, body) {
  const opts = { method, headers: {} };
  if (typeof body === 'string') {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = body;
  } else if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.substring(0, 500) }; }
  return { status: r.status, body: json };
}

async function main() {
  const accessTokens = {
    'FB App Token': `${FB_APP_ID}|${FB_APP_SECRET}`,
    'IG App Token': `${IG_APP_ID}|${IG_APP_SECRET}`,
  };
  if (USER_TOKEN) accessTokens['User Token'] = USER_TOKEN;

  // 1. Try to set up IG App webhook with each token
  for (const [label, token] of Object.entries(accessTokens)) {
    console.log(`\n=== Set IG App webhook via ${label} ===`);
    const r = await call('POST', `https://graph.facebook.com/v26.0/${IG_APP_ID}/subscriptions`,
      `object=instagram&callback_url=${encodeURIComponent(CALLBACK_URL)}&verify_token=${encodeURIComponent(VERIFY_TOKEN)}&fields=comments,messages&access_token=${encodeURIComponent(token)}`
    );
    console.log(JSON.stringify(r.body, null, 2));

    // Try reading existing subscriptions
    console.log(`\n=== Read IG App subs via ${label} ===`);
    const r2 = await call('GET', `https://graph.facebook.com/v26.0/${IG_APP_ID}/subscriptions?access_token=${encodeURIComponent(token)}`);
    console.log(JSON.stringify(r2.body, null, 2));
  }

  // 2. Try to subscribe IG account to FB App via app token
  console.log('\n=== Subscribe IG to FB App (FB app token) ===');
  let r = await call('POST', `https://graph.facebook.com/v26.0/${IG_ID}/subscribed_apps`, {
    access_token: `${FB_APP_ID}|${FB_APP_SECRET}`,
    subscribed_fields: 'comments,messages'
  });
  console.log(JSON.stringify(r.body, null, 2));

  // 3. Try with page token from DB
  console.log('\n=== Check page 1229304876940609 ===');
  r = await call('GET', `https://graph.facebook.com/v26.0/1229304876940609?fields=id,name&access_token=${USER_TOKEN || FB_APP_ID + '|' + FB_APP_SECRET}`);
  console.log(JSON.stringify(r.body, null, 2));

  // 4. Get the page token and use it
  console.log('\n=== Get page access_token ===');
  r = await call('GET', `https://graph.facebook.com/v26.0/1229304876940609?fields=access_token&access_token=${USER_TOKEN}`);
  const pt = r.body.access_token;
  if (pt) {
    console.log('Page token obtained:', pt.substring(0, 20) + '...');

    console.log('\n=== Subscribe IG via page token ===');
    r = await call('POST', `https://graph.facebook.com/v26.0/${IG_ID}/subscribed_apps`, {
      access_token: pt,
      subscribed_fields: 'comments,messages'
    });
    console.log(JSON.stringify(r.body, null, 2));
  }

  // 5. Try v25.0 API
  console.log('\n=== Subscribe IG via FB app token (v25.0) ===');
  r = await call('POST', `https://graph.facebook.com/v25.0/${IG_ID}/subscribed_apps`, {
    access_token: `${FB_APP_ID}|${FB_APP_SECRET}`,
    subscribed_fields: 'comments,messages'
  });
  console.log(JSON.stringify(r.body, null, 2));

  // 6. Try with just "comments" (no "messages")
  console.log('\n=== Subscribe IG via FB app token (comments only) ===');
  r = await call('POST', `https://graph.facebook.com/v26.0/${IG_ID}/subscribed_apps`, {
    access_token: `${FB_APP_ID}|${FB_APP_SECRET}`,
    subscribed_fields: 'comments'
  });
  console.log(JSON.stringify(r.body, null, 2));

  // 7. Final report
  console.log('\n=== FB App subscriptions (current) ===');
  r = await call('GET', `https://graph.facebook.com/v26.0/${FB_APP_ID}/subscriptions?access_token=${FB_APP_ID}|${FB_APP_SECRET}`);
  console.log(JSON.stringify(r.body, null, 2));
}

main().catch(e => console.error(e.message));