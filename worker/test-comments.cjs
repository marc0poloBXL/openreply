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
  const igId = acct.instagramId;
  const appToken = `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;

  // Test: can we read the IG Business Account with an App Access Token?
  const url1 = `https://graph.facebook.com/${v}/${igId}?fields=id,username,name&access_token=${appToken}`;
  const r1 = await fetch(url1);
  const d1 = await r1.json();
  console.log("IG account via App Token:", d1.error ? "ERROR: " + d1.error.message.slice(0, 80) : "OK: " + d1.username);

  // Test: can we get media with App Token?
  const url2 = `https://graph.facebook.com/${v}/${igId}/media?fields=id&limit=1&access_token=${appToken}`;
  const r2 = await fetch(url2);
  const d2 = await r2.json();
  console.log("Media via App Token:", d2.error ? "ERROR: " + d2.error.message.slice(0, 80) : "OK: " + (d2.data||[]).length + " posts");

  // Test: Try the Instagram Business ID comments endpoint on graph.facebook.com using our IGAA token
  // This might work if the IG Business Account has proper permissions
  const mediaResp = await fetch(`https://graph.instagram.com/${v}/me/media?fields=id&limit=1&access_token=${token}`);
  const mediaData = await mediaResp.json();
  if (mediaData.data && mediaData.data[0]) {
    const postId = mediaData.data[0].id;

    // Test: Comments via Instagram Graph API with media-user-id parameter
    const url3 = `https://graph.instagram.com/${v}/${postId}/comments?fields=id,text,timestamp,username&access_token=${token}`;
    const r3 = await fetch(url3);
    const d3 = await r3.json();
    console.log(`\nPost ${postId} - Comments via ig.com:`, d3.error ? "ERROR: " + d3.error.message.slice(0, 80) : (d3.data||[]).length + " comments");

    // Check if 'username' field exists instead of 'from'
    if (d3.data && d3.data.length > 0) {
      console.log("Sample comment:", JSON.stringify(d3.data[0]));
    }
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });