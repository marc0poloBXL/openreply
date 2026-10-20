
const IG_APP_ID = '2616058292165458';
const CALLBACK_URL = 'https://openreply-zeta-ruby.vercel.app/api/webhook';
const VERIFY_TOKEN = 'stoiczodiac-webhook-2026';
const PAGE_TOKEN = process.env.FB_PAGE_TOKEN;

async function main() {
  // Try page token to set IG App webhook
  console.log('=== Try page token to set IG App webhook ===');
  const body = new URLSearchParams({
    object: 'instagram',
    callback_url: CALLBACK_URL,
    verify_token: VERIFY_TOKEN,
    fields: 'comments,messages',
    access_token: PAGE_TOKEN
  });
  const r = await fetch(`https://graph.facebook.com/v26.0/${IG_APP_ID}/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const data = await r.json();
  console.log(JSON.stringify(data, null, 2));

  // Check if page token can read IG App
  console.log('\n=== Check if page token can read IG App ===');
  const r2 = await fetch(`https://graph.facebook.com/v26.0/${IG_APP_ID}?fields=id,name&access_token=${encodeURIComponent(PAGE_TOKEN)}`);
  const data2 = await r2.json();
  console.log(JSON.stringify(data2, null, 2));
}
main().catch(e => console.error(e));