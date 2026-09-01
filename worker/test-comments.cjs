require("tsx/cjs");
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });
const crypto = require("crypto");
const { prisma } = require("../lib/db/client");

async function main() {
  const acct = await prisma.instagramAccount.findFirst();
  if (!acct) { console.log("No account"); return; }
  const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
  const combined = Buffer.from(acct.accessToken, "base64");
  const iv = combined.subarray(0, 16);
  const authTag = combined.subarray(16, 32);
  const ciphertext = combined.subarray(32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const token = decipher.update(ciphertext) + decipher.final("utf8");

  const v = "v26.0";

  // Get first post
  const mediaResp = await fetch(`https://graph.instagram.com/${v}/me/media?fields=id,caption,timestamp,comments_count&limit=1&access_token=${token}`);
  const mediaData = await mediaResp.json();
  if (mediaData.error) { console.log("Media error:", mediaData.error.message); return; }
  if (!mediaData.data || !mediaData.data[0]) { console.log("No posts"); return; }

  const postId = mediaData.data[0].id;
  console.log(`Post ${postId} (comments_count: ${mediaData.data[0].comments_count})`);

  // Try without 'from' field - just text and username
  const url1 = `https://graph.instagram.com/${v}/${postId}/comments?fields=id,text,timestamp,username&access_token=${token}`;
  const r1 = await fetch(url1);
  const d1 = await r1.json();
  console.log("Test A (with username):", d1.error ? "ERR: " + d1.error.message.slice(0, 60) : (d1.data||[]).length + " comments");

  // Try with just 'id'
  const url2 = `https://graph.instagram.com/${v}/${postId}/comments?fields=id&access_token=${token}`;
  const r2 = await fetch(url2);
  const d2 = await r2.json();
  console.log("Test B (just id):", d2.error ? "ERR: " + d2.error.message.slice(0, 60) : (d2.data||[]).length + " comments");

  // Try the same but with media_product_type=REELS
  if (d1.data && d1.data.length > 0) {
    console.log("Sample comment:", JSON.stringify(d1.data[0]));
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });