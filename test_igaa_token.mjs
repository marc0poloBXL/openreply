// Test: can IGAA token read comments via Facebook Graph API?
import crypto from "crypto";

async function main() {
  // Database credentials
  const DATABASE_URL = process.env.DATABASE_URL;
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

  // Connect to Postgres directly
  const { Client } = await import("pg");
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  // Get the Instagram account + encrypted token
  const result = await client.query(
    'SELECT "instagramId", "username", "accessToken", "pageToken" FROM "InstagramAccount" LIMIT 1'
  );

  if (result.rows.length === 0) {
    console.log("No Instagram accounts in database");
    await client.end();
    return;
  }

  const acct = result.rows[0];
  console.log("Account:", acct.username, "| IG ID:", acct.instagramId);
  console.log("Has pageToken:", !!acct.pageToken);

  // Decrypt the IGAA token
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const combined = Buffer.from(acct.accessToken, "base64");
  const iv = combined.subarray(0, 16);
  const authTag = combined.subarray(16, 32);
  const ciphertext = combined.subarray(32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const igaaToken = decipher.update(ciphertext) + decipher.final("utf8");
  // console.log("IGAA token prefix:", igaaToken.substring(0, 6));

  // TEST 1: Get media via graph.instagram.com (what the current code does)
  console.log("\n--- TEST 1: graph.instagram.com/me/media ---");
  const r1 = await fetch(`https://graph.instagram.com/v26.0/me/media?fields=id,caption,timestamp,comments_count&limit=1&access_token=${igaaToken}`);
  const d1 = await r1.json();
  if (d1.error) {
    console.log("FAIL:", d1.error.message);
  } else if (d1.data?.length > 0) {
    console.log("OK: Found", d1.data.length, "posts");
    const postId = d1.data[0].id;
    console.log("Post ID:", postId);

    // TEST 2: Read comments via graph.instagram.com
    console.log("\n--- TEST 2: graph.instagram.com/{postId}/comments ---");
    const r2 = await fetch(`https://graph.instagram.com/v26.0/${postId}/comments?fields=id,text,from,timestamp&access_token=${igaaToken}`);
    const d2 = await r2.json();
    if (d2.error) console.log("FAIL:", d2.error.message);
    else console.log("Comments:", d2.data?.length || 0, JSON.stringify(d2.data?.slice(0, 2)));

    // TEST 3: Read comments via graph.facebook.com with IGAA token
    console.log("\n--- TEST 3: graph.facebook.com/{igId}/media (with IGAA token) ---");
    const r3 = await fetch(`https://graph.facebook.com/v26.0/${acct.instagramId}/media?fields=id,caption&limit=1&access_token=${igaaToken}`);
    const d3 = await r3.json();
    if (d3.error) console.log("Result:", d3.error.message);
    else console.log("Success:", JSON.stringify(d3.data?.slice(0, 1)));

    // TEST 4: Read comments via graph.facebook.com/{postId}/comments with IGAA token
    console.log("\n--- TEST 4: graph.facebook.com/{postId}/comments (with IGAA token) ---");
    const r4 = await fetch(`https://graph.facebook.com/v26.0/${postId}/comments?fields=id,text,from,timestamp,replies{from}&access_token=${igaaToken}`);
    const d4 = await r4.json();
    if (d4.error) console.log("Result:", d4.error.message);
    else console.log("Comments:", d4.data?.length || 0, JSON.stringify(d4.data?.slice(0, 2)));
  } else {
    console.log("No posts found");
  }

  await client.end();
}

main().catch(e => console.error("FATAL:", e.message));