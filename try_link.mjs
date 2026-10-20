// try_link.mjs — try linking IG to FB page via different methods
const USER_TOKEN = process.env.FB_USER_TOKEN;
const PAGE_TOKEN = process.env.FB_PAGE_TOKEN;
const IG_ID = '17841438935909153';
const PAGE_ID = '1229304876940609';

async function call(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  return { status: r.status, body: await r.json() };
}

async function main() {
  // 1. Try link with page token
  console.log('1. Link with page token:');
  let r = await call('POST', `https://graph.facebook.com/v26.0/${PAGE_ID}/instagram_accounts`, {
    access_token: PAGE_TOKEN, instagram_account_id: IG_ID
  });
  console.log(JSON.stringify(r.body, null, 2));

  // 2. Try link with user token
  console.log('\n2. Link with user token:');
  r = await call('POST', `https://graph.facebook.com/v26.0/${PAGE_ID}/instagram_accounts`, {
    access_token: USER_TOKEN, instagram_account_id: IG_ID
  });
  console.log(JSON.stringify(r.body, null, 2));

  // 3. Subscribe via user token
  console.log('\n3. Subscribe via user token on fb graph:');
  r = await call('POST', `https://graph.facebook.com/v26.0/${IG_ID}/subscribed_apps`, {
    access_token: USER_TOKEN, subscribed_fields: 'comments,messages'
  });
  console.log(JSON.stringify(r.body, null, 2));

  // 4. Subscribe via page token (fresh)
  console.log('\n4. Subscribe via page token on fb graph:');
  r = await call('POST', `https://graph.facebook.com/v26.0/${IG_ID}/subscribed_apps`, {
    access_token: PAGE_TOKEN, subscribed_fields: 'comments,messages'
  });
  console.log(JSON.stringify(r.body, null, 2));

  // 5. Subscribe via IGAA on instagram graph
  console.log('\n5. Subscribe via IGAA on instagram graph (read from DB):');
  // We'll skip this in CLI since we'd need to decrypt
  console.log('(needs DB access - checking existing webhook events instead)');

  // 6. Check current subscriptions
  console.log('\n6. Current subscriptions on app 1051360407668084:');
  const FB_APP_ID = '1051360407668084';
	const FB_APP_SECRET = process.env.FB_APP_SECRET;
	const appToken = `${FB_APP_ID}|${FB_APP_SECRET}`;
	r = await call('GET', `https://graph.facebook.com/v26.0/1051360407668084/subscriptions?access_token=${appToken}`);
  console.log(JSON.stringify(r.body, null, 2));
}

main().catch(e => console.error(e.message));