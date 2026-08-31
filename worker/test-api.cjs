require("tsx/cjs");
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });
const crypto = require("crypto");
const { prisma } = require("../lib/db/client");

async function main() {
  const acct = await prisma.instagramAccount.findFirst();
  if (!acct) { console.log("No account found"); return; }
  console.log("Account:", acct.username);

  // Decrypt token (same as oauth.ts)
  const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
  const combined = Buffer.from(acct.accessToken, "base64");
  const iv = combined.subarray(0, 16);
  const authTag = combined.subarray(16, 32);
  const ciphertext = combined.subarray(32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const pageToken = decipher.update(ciphertext) + decipher.final("utf8");
  console.log("Token length:", pageToken.length);
  console.log("First char:", pageToken[0], "Second:", pageToken[1], "Third:", pageToken[2]);
  console.log("First 10 chars:", pageToken.slice(0, 10));

  await prisma.$disconnect();
}
main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });