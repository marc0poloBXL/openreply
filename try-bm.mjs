// try-bm.mjs — Try to get page token via Business Portfolio
const token = process.argv[2] || "EAAO8NOuhRXQBSZADbDByHjuTs6ijoyIVZAAZBAdFtZAZCwvCEZC9ulQBqpg3gwvOAKKOBnZBdQMGFwuVuOHj5enLl6gdrtC67VhDgQTlXqcQuxB2qobZBYfyhZBZAVd4kz8eOoIg2fDw8pBQVhRfeRR3h2SKzqIWnWl8NeBUgBUqc7W6nxZBSPnQR5MN6raRDVLCgZDZD";
const BM_ID = "2052016095704629";

async function call(method, url, body) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(body).toString();
  }
  const r = await fetch(url, opts);
  return { status: r.status, body: await r.json() };
}

async function main() {
  console.log('=== BM client_pages ===');
  const r1 = await call('GET', `https://graph.facebook.com/v21.0/${BM_ID}/client_pages?access_token=${encodeURIComponent(token)}`);
  console.log(JSON.stringify(r1.body, null, 2));

  if (r1.body?.data) {
    for (const page of r1.body.data) {
      if (page.id === '1229304876940609') {
        console.log('\n=== Found page! Getting access_token ===');
        const r2 = await call('GET', `https://graph.facebook.com/v21.0/${page.id}?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`);
        console.log(JSON.stringify(r2.body, null, 2));
      }
    }
  }

  console.log('\n=== BM owned_pages ===');
  const r3 = await call('GET', `https://graph.facebook.com/v21.0/${BM_ID}/owned_pages?access_token=${encodeURIComponent(token)}`);
  console.log(JSON.stringify(r3.body, null, 2));
}
main().catch(e => console.error(e.message));