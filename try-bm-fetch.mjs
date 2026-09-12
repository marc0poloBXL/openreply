// try-bm-fetch.mjs — Uses Web APIs through Node.js fetch directly
const token = process.argv[2] || "EAAO8NOuhRXQBSZADbDByHjuTs6ijoyIVZAAZBAdFtZAZCwvCEZC9ulQBqpg3gwvOAKKOBnZBdQMGFwuVuOHj5enLl6gdrtC67VhDgQTlXqcQuxB2qobZBYfyhZBZAVd4kz8eOoIg2fDw8pBQVhRfeRR3h2SKzqIWnWl8NeBUgBUqc7W6nxZBSPnQR5MN6raRDVLCgZDZD";
const BM_ID = "2052016095704629";

async function call(method, url) {
  const r = await fetch(url, { method });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { raw: text.substring(0, 500) }; }
}

async function main() {
  console.log("Page Token Check:");
  const r1 = await call("GET", `https://graph.instagram.com/v21.0/17841438935909153?fields=id,username&access_token=${encodeURIComponent(token)}`);
  console.log("IG via IG graph:", JSON.stringify(r1));

  const r2 = await call("GET", `https://graph.facebook.com/v21.0/1229304876940609?fields=id,name&access_token=${encodeURIComponent(token)}`);
  console.log("Page via FB graph:", JSON.stringify(r2));

  const r3 = await call("GET", `https://graph.facebook.com/v21.0/2052016095704629?fields=id,name&access_token=${encodeURIComponent(token)}`);
  console.log("BM via FB graph:", JSON.stringify(r3));

  const r4 = await call("GET", `https://graph.facebook.com/v21.0/2052016095704629/client_pages?access_token=${encodeURIComponent(token)}`);
  console.log("BM client_pages:", JSON.stringify(r4));
}
main().catch(e => console.error(e.message));