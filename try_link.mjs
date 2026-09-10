// try_link.mjs — try linking IG to FB page via different methods
const USER_TOKEN = 'EAAO8NOuhRXQBSSnKot3LTPhFYiT8LSFplNLB1iuJsVwCGbbTHTtRNuTY07JnD5OZBe4CZC9s5ZBmdRjAkOFujk4aceocfPNgYzR3hGnt9ZAjBohpywRxy1HxAQL4oGWwDHbjPGmbIjTI15IhGLTZCAEQIDKd2WA3ARDhoyO5OW9h5CwE2wyuYz3Oy69ViB7ZBmpbAoX03Y8iUU0ZCrEpvhlG67mA6h3vARucnSp5C0NTmMPNirVZBXMFpQaZBXjbUA178VkUnCLdJBR4J6ZASymbZCy';
const PAGE_TOKEN = 'EAAO8NOuhRXQBSXZCgXsJKOlfhRQrAJZA3fPv4WeGog4WXJgKIPT9xrDuqtIkMNBIoxDYbUmA3G8ZCCRRiG9IJwvUzw5QEjkLfCDK6JDPtJ7BtN0bFRTgRC2XbiXr3VZCKLC6xcn9cmiZAcHNYBqmnVHUTb2Uoz3UqJphZCX3U5n7OvdZCyHPDVD9HrdZA86ZAu6bTx9El3BZBJ3pCogsZAkmRqe1guTaUmvOIZA4Mk5fDBcZD';
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
  r = await call('GET', `https://graph.facebook.com/v26.0/1051360407668084/subscriptions?access_token=1051360407668084|b2708ce0c790783fbf27c0dfcc0e1459`);
  console.log(JSON.stringify(r.body, null, 2));
}

main().catch(e => console.error(e.message));