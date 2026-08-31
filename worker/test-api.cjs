require("tsx/cjs");
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });
const crypto = require("crypto");
const { prisma } = require("../lib/db/client");

async function main() {
  const acct = await prisma.instagramAccount.findFirst();
  if (!acct) { console.log("No account found"); return; }
  console.log("Account:", acct.username);

  const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
  const combined = Buffer.from(acct.accessToken, "base64");
  const iv = combined.subarray(0, 16);
  const authTag = combined.subarray(16, 32);
  const ciphertext = combined.subarray(32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const token = decipher.update(ciphertext) + decipher.final("utf8");
  console.log("Token starts with:", token.slice(0, 10));

  const v = "v26.0";
  // Get posts via graph.instagram.com
  const mediaResp = await fetch(`https://graph.instagram.com/${v}/me/media?fields=id,caption,timestamp,comments_count&limit=5&access_token=${token}`);
  const mediaData = await mediaResp.json();
  if (mediaData.error) { console.log("Media error:", mediaData.error.message); return; }

  for (const p of (mediaData.data || [])) {
    console.log(`\nPost ${p.id} (comments_count: ${p.comments_count}):`);
    // Try comments endpoint on graph.instagram.com
    const cResp = await fetch(`https://graph.instagram.com/${v}/${p.id}/comments?fields=id,text,timestamp,from{id,username}&access_token=${token}`);
    const cData = await cResp.json();
    if (cData.error) {
      console.log("  Comments error:", cData.error.message, "[code:", cData.error.code, "]");
    } else {
      const comments = (cData.data || []);
      console.log(`  Comments found: ${comments.length}`);
      for (const c of comments) {
        console.log(`    @${c.from?.username || "?"}: "${c.text?.slice(0, 50)}"`);
      }
    }
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });