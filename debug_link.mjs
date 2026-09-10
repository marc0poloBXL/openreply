#!/usr/bin/env node
/**
 * Page/IG Link Diagnostic — Standalone
 *
 * Uses the page token from the database (via API call) to probe the
 * Facebook Graph API and find where @stoiczodiac is actually linked.
 *
 * Usage:
 *   node debug_link.mjs <page-token>
 *
 * Or via the /api/ig-link page's Force Link feature.
 */

const PAGE_ID = "1229304876940609";
const PAGE_ID_OLD = "61594011424463";
const IG_ID = "17841438935909153";
const BMS = ["2052016095704629", "5180791675279566"];

const token = process.argv[2];
if (!token) {
  console.error("Usage: node debug_link.mjs <page-token>");
  process.exit(1);
}

async function call(url) {
  const r = await fetch(url);
  return { status: r.status, body: await r.json() };
}

async function main() {
  console.log("=== PAGE/IG LINK DIAGNOSTIC ===\n");

  // 1. Check current page
  console.log("--- 1. Current page (1229304876940609) ---");
  let r = await call(`https://graph.facebook.com/v26.0/${PAGE_ID}?fields=id,name,about,category,tasks,connected_instagram_account{id,username},instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`);
  console.log(JSON.stringify(r.body, null, 2));

  // 2. Check old page
  console.log("\n--- 2. Old page (61594011424463) ---");
  r = await call(`https://graph.facebook.com/v26.0/${PAGE_ID_OLD}?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`);
  console.log(JSON.stringify(r.body, null, 2));

  // 3. Check /me/accounts — what pages does this token manage?
  console.log("\n--- 3. /me/accounts (all pages this token can see) ---");
  r = await call(`https://graph.facebook.com/v26.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`);
  console.log(JSON.stringify(r.body, null, 2));

  // 4. If we got pages, check each for IG link
  if (r.body.data) {
    console.log(`\n--- 4. Checking ${r.body.data.length} pages for IG link ---`);
    for (const page of r.body.data) {
      const ig = page.instagram_business_account;
      const linked = ig?.id === IG_ID;
      console.log(`  ${linked ? "✅" : "  "} ${page.name} (${page.id})${ig ? ` → IG: @${ig.username} (${ig.id})` : " → no IG"}`);
    }
  }

  // 5. Try to check IG via app access token (public info only)
  console.log("\n--- 5. IG account public info ---");
  r = await call(`https://graph.facebook.com/v26.0/${IG_ID}?fields=id,username,name&access_token=${encodeURIComponent(token)}`);
  console.log(JSON.stringify(r.body, null, 2));

  // 6. Check what user issued this token
  console.log("\n--- 6. Token owner ---");
  r = await call(`https://graph.facebook.com/v26.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
  console.log(JSON.stringify(r.body, null, 2));

  // 7. Try BMs
  console.log("\n--- 7. Business Managers ---");
  for (const bm of BMS) {
    r = await call(`https://graph.facebook.com/v26.0/${bm}?fields=id,name&access_token=${encodeURIComponent(token)}`);
    console.log(`BM ${bm}:`, JSON.stringify(r.body, null, 2));
  }

  // 8. Check the /{ig-id} on business platform
  console.log("\n--- 8. IG account on FB graph (with page token) ---");
  r = await call(`https://graph.facebook.com/v26.0/${IG_ID}?fields=id,username,name,followers_count,profile_picture_url&access_token=${encodeURIComponent(token)}`);
  console.log(JSON.stringify(r.body, null, 2));

  console.log("\n=== DIAGNOSTIC COMPLETE ===");
}
main().catch(console.error);