#!/usr/bin/env node
/**
 * Try to link @stoiczodiac to the Stoic Zodiac Facebook Page via Graph API.
 *
 * Reads the stored page token from the database and attempts the link.
 * Requires the page token to have pages_manage_metadata scope.
 *
 * Usage: node link_ig_to_page.mjs
 */

const IG_ID = "17841438935909153";   // @stoiczodiac
const PAGE_ID = "61594011424463";    // Stoic Zodiac Facebook Page
const APP_ID = "1051360407668084";   // stoiczodiac-dm

// Decrypt helper
async function decryptToken(encrypted) {
  const crypto = await import("crypto");
  const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
  const b = Buffer.from(encrypted, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key, b.subarray(0, 16));
  d.setAuthTag(b.subarray(16, 32));
  return d.update(b.subarray(32)) + d.final("utf8");
}

async function main() {
  if (!process.env.DATABASE_URL || !process.env.ENCRYPTION_KEY) {
    console.error("❌ DATABASE_URL and ENCRYPTION_KEY must be set");
    process.exit(1);
  }
  if (!process.env.FACEBOOK_APP_SECRET) {
    console.error("❌ FACEBOOK_APP_SECRET must be set");
    process.exit(1);
  }

  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Get stored tokens
  const result = await client.query(
    'SELECT "pageToken", "accessToken" FROM "InstagramAccount" LIMIT 1'
  );
  if (!result.rows.length) { console.error("❌ No InstagramAccount found"); process.exit(1); }

  const pageToken = result.rows[0].pageToken
    ? await decryptToken(result.rows[0].pageToken)
    : null;
  const igaaToken = result.rows[0].accessToken
    ? await decryptToken(result.rows[0].accessToken)
    : null;

  console.log("=== Token Status ===");
  console.log(`Page token: ${pageToken ? pageToken.substring(0, 20) + "..." : "❌ NONE"}`);
  console.log(`IGAA token: ${igaaToken ? igaaToken.substring(0, 20) + "..." : "❌ NONE"}`);

  const appToken = `${APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;

  // Step 1: Debug the page token to see its scopes
  console.log("\n=== Step 1: Checking page token scopes ===");
  if (pageToken) {
    const debugRes = await fetch(
      `https://graph.facebook.com/v26.0/debug_token?input_token=${encodeURIComponent(pageToken)}&access_token=${appToken}`
    );
    const debugData = await debugRes.json();
    if (debugData.data) {
      console.log(`App: ${debugData.data.app_id} (type: ${debugData.data.type})`);
      console.log(`Expires: ${new Date(debugData.data.expires_at * 1000).toISOString()}`);
      console.log(`Scopes: ${debugData.data.scopes?.join(", ") || "none"}`);
      console.log(`Valid: ${debugData.data.is_valid}`);
      if (!debugData.data.scopes?.includes("pages_manage_metadata") &&
          !debugData.data.scopes?.includes("pages_manage_instagram")) {
        console.log("\n⚠️  Page token is missing 'pages_manage_metadata' scope.");
        console.log("   A new token with this scope is needed to link the IG account.");
        console.log("   We can try anyway — the existing token may still work.");
      }
    } else {
      console.log("Debug failed:", JSON.stringify(debugData.error || debugData));
    }
  }

  // Step 2: Try method A — POST /{ig-id}/owner
  console.log("\n=== Step 2: Method A — POST /{ig-id}/owner (set owner page) ===");
  if (pageToken) {
    const url = `https://graph.facebook.com/v26.0/${IG_ID}/owner`;
    console.log(`POST ${url}`);
    console.log(`  page_id: ${PAGE_ID}`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: pageToken,
        page_id: PAGE_ID,
      }),
    });
    const data = await res.json();
    console.log("Result:", JSON.stringify(data, null, 2));

    if (data.success) {
      console.log("\n✅ IG linked to page via /owner endpoint!");
    } else if (data.error) {
      console.log(`\n❌ Failed (${data.error.code}): ${data.error.message}`);
      if (data.error.error_user_title) console.log(`   Title: ${data.error.error_user_title}`);
      if (data.error.error_user_msg) console.log(`   Message: ${data.error.error_user_msg}`);
    }
  }

  // Step 3: Try method B — POST /{page-id}/instagram_accounts
  console.log("\n=== Step 3: Method B — POST /{page-id}/instagram_accounts ===");
  if (pageToken) {
    const url = `https://graph.facebook.com/v26.0/${PAGE_ID}/instagram_accounts`;
    console.log(`POST ${url}`);
    console.log(`  instagram_account_id: ${IG_ID}`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: pageToken,
        instagram_account_id: IG_ID,
      }),
    });
    const data = await res.json();
    console.log("Result:", JSON.stringify(data, null, 2));

    if (data.success) {
      console.log("\n✅ IG linked to page via /instagram_accounts endpoint!");
    } else if (data.error) {
      console.log(`\n❌ Failed (${data.error.code}): ${data.error.message}`);
    }
  }

  // Step 4: Check current page/IG relationship
  console.log("\n=== Step 4: Check current page ===");
  if (pageToken) {
    const checkRes = await fetch(
      `https://graph.facebook.com/v26.0/${PAGE_ID}?fields=name,instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`
    );
    const checkData = await checkRes.json();
    if (checkData.instagram_business_account) {
      console.log(`✅ Page is linked to IG: @${checkData.instagram_business_account.username} (${checkData.instagram_business_account.id})`);
    } else {
      console.log(`❌ Page has NO linked Instagram account.`);
      console.log("   Full response:", JSON.stringify(checkData, null, 2));
    }
  }

  // Step 5: Try via IGAA token on graph.instagram.com
  console.log("\n=== Step 5: Method C — Check IGAA token scope ===");
  if (igaaToken) {
    const igMeRes = await fetch(
      `https://graph.instagram.com/v26.0/me?fields=user_id,username&access_token=${encodeURIComponent(igaaToken)}`
    );
    const igMe = await igMeRes.json();
    console.log("IGAA me:", JSON.stringify(igMe, null, 2));

    if (igMe.user_id && String(igMe.user_id) === IG_ID) {
      console.log(`✅ IGAA token is for @stoiczodiac (${igMe.user_id})`);
    }
  }

  await client.end();
  console.log("\nDone.");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });