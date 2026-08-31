require("tsx/cjs");
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });
const { prisma } = require("../lib/db/client");

async function main() {
  const acct = await prisma.instagramAccount.findFirst();
  if (!acct) { console.log("No account found"); return; }
  console.log("Account:", acct.username);
  console.log("Token stored length:", acct.accessToken?.length);
  console.log("Token expires at:", acct.tokenExpiresAt);

  try {
    const crypto = require("crypto");
    const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
    const combined = Buffer.from(acct.accessToken, "base64");
    console.log("Combined buffer length:", combined.length, "bytes");

    const iv = combined.subarray(0, 16);
    const authTag = combined.subarray(16, 32);
    const ciphertext = combined.subarray(32);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    decipher.update(ciphertext) + decipher.final("utf8");
    console.log("DECRYPTION: SUCCESS");
  } catch (e) {
    console.log("DECRYPTION: FAILED");
    console.log("Error:", e.message);
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });