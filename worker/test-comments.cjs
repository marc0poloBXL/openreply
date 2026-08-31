require("tsx/cjs");
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });
const crypto = require("crypto");
const { prisma } = require("../lib/db/client");

async function main() {
  const acct = await prisma.instagramAccount.findFirst();
  if (!acct) { console.log("No account found"); return; }
  const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
  const combined = Buffer.from(acct.accessToken, "base64");
  const iv = combined.subarray(0, 16);
  const authTag = combined.subarray(16, 32);
  const ciphertext = combined.subarray(32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const token = decipher.update(ciphertext) + decipher.final("utf8");
  console.log("Token:", token.slice(0, 10) + "...");

  const v = "v26.0";
  // Get posts
  const mediaResp = await fetch(`https://graph.instagram.com/${v}/me/media?fields=id,caption,timestamp,comments_count&limit=5&access_token=${token}`);
  const mediaData = await mediaResp.json();
  if (mediaData.error) { console.log("Media error:", mediaData.error.message); return; }

  for (const p of (mediaData.data || [])) {
    console.log(`\nPost ${p.id} (comments_count: ${p.comments_count})`);

    // Test 1: simple fields without from
    const url1 = `https://graph.instagram.com/${v}/${p.id}/comments?fields=id,text,timestamp&access_token=${token}`;
    const r1 = await fetch(url1);
    const d1 = await r1.json();
    if (d1.error) console.log("  Test 1 (no from):", d1.error.message);
    else console.log("  Test 1 (no from):", (d1.data || []).length, "comments");

    // Test 2: check if we can get the media on graph.facebook.com (maybe it works with IGAA there too?)
    const url2 = `https://graph.facebook.com/${v}/${p.id}/comments?fields=id,text,timestamp,from&access_token=${token}&limit=5`;
    const r2 = await fetch(url2);
    const d2 = await r2.json();
    if (d2.error) console.log("  Test 2 (fb.com):", d2.error.message);
    else console.log("  Test 2 (fb.com):", (d2.data || []).length, "comments");
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });