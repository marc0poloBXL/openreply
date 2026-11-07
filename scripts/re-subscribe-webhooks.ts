/**
 * Re-subscribe @stoiczodiac's Instagram webhooks to include messaging_postbacks.
 *
 * Why: The LIVE Meta-side subscription may still be from before the code fix,
 * missing the "messaging_postbacks" field needed for quick-reply button taps.
 * This script forces a re-subscribe with the correct subscribed_fields.
 *
 * Usage: npx tsx --env-file=.env scripts/re-subscribe-webhooks.ts
 *         (--env-file=.env — NOT .env.local — because DATABASE_URL lives in .env)
 */

import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { createDecipheriv, createHash } from "crypto";
import { PrismaClient } from "../app/generated/prisma/client";

const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ALGORITHM = "aes-256-gcm";
const IG_ID = "17841438935909153";

function getDecryptionKey(): Buffer {
  const hex = process.env["ENCRYPTION_KEY"]?.trim();
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error(
      "ENCRYPTION_KEY must be a 32-byte (64-char) hex string"
    );
  }
  return Buffer.from(hex, "hex");
}

function decryptToken(encryptedBase64: string): string {
  const key = getDecryptionKey();
  const combined = Buffer.from(encryptedBase64, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8"
  );
}

function baseUrlForToken(token: string): string {
  // EA prefix = Facebook (long-lived) token → graph.facebook.com
  // Anything else (IGAA prefix) = Instagram Basic Display token → graph.instagram.com
  return token.startsWith("EA")
    ? "https://graph.facebook.com"
    : "https://graph.instagram.com";
}

async function main() {
  // ── 1. Connect to DB ──────────────────────────────────────────────────────
  const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  // ── 2. Fetch @stoiczodiac's Instagram account ─────────────────────────────
  const account = await prisma.instagramAccount.findFirst({
    where: { username: "stoiczodiac" },
  });

  if (!account) {
    console.log("❌ Instagram account @stoiczodiac not found in DB.");
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log("=== @stoiczodiac Account ===");
  console.log("DB ID:", account.id);
  console.log("instagramId:", account.instagramId);
  console.log("webhookSubscribed (DB flag):", account.webhookSubscribed);
  console.log("tokenExpiresAt:", account.tokenExpiresAt);
  console.log("accessToken set:", account.accessToken ? "✅ YES" : "❌ NO");
  console.log("pageToken set:", account.pageToken ? "✅ YES" : "❌ NO");
  console.log("");

  // ── 3. Pick the best token to use ─────────────────────────────────────────
  // accessToken is the primary token used for API calls.
  // If accessToken is empty, fall back to pageToken (from Facebook Login).
  let encryptedToken: string | null = null;
  let tokenSource = "";

  if (account.accessToken) {
    encryptedToken = account.accessToken;
    tokenSource = "accessToken";
  } else if (account.pageToken) {
    encryptedToken = account.pageToken;
    tokenSource = "pageToken (fallback)";
  }

  if (!encryptedToken) {
    console.log("❌ No token found in DB (both accessToken and pageToken are empty).");
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`Using token source: ${tokenSource}`);

  // ── 4. Decrypt the token ──────────────────────────────────────────────────
  let decryptedToken: string;
  try {
    decryptedToken = decryptToken(encryptedToken);
    console.log("✅ Token decrypted successfully");
    console.log("Token prefix:", decryptedToken.substring(0, 8) + "...");
  } catch (err) {
    console.log("❌ Failed to decrypt token:", err);
    await prisma.$disconnect();
    process.exit(1);
  }

  // ── 5. Determine correct base URL ─────────────────────────────────────────
  const baseUrl = baseUrlForToken(decryptedToken);
  console.log("Using API host:", baseUrl);

  // ── 6. POST to subscribe with messaging_postbacks ─────────────────────────
  const url = `${baseUrl}/v26.0/${IG_ID}/subscribed_apps`;
  console.log("");
  console.log(`POST ${url}`);
  console.log('subscribed_fields: ["comments","messages","messaging_postbacks"]');

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: decryptedToken,
      subscribed_fields: ["comments", "messages", "messaging_postbacks"],
    }),
  });

  const data: any = await response.json();
  console.log("");
  console.log("=== Response ===");
  console.log("Status:", response.status);
  console.log("Full response:", JSON.stringify(data, null, 2));

  // ── 7. Update DB flag if successful ───────────────────────────────────────
  if (data.success === true) {
    console.log("");
    console.log("✅ WEBHOOK RE-SUBSCRIBE SUCCEEDED.");
    console.log("   messaging_postbacks is now active on @stoiczodiac.");

    await prisma.instagramAccount.update({
      where: { id: account.id },
      data: { webhookSubscribed: true },
    });
    console.log("   DB webhookSubscribed flag updated to true.");
  } else {
    console.log("");
    console.log("❌ Webhook subscribe failed.");
    if (data.error) {
      console.log("   Error code:", data.error.code);
      console.log("   Error message:", data.error.message);
      if (
        data.error.code === 190 ||
        data.error.message?.includes("access token")
      ) {
        console.log("");
        console.log("⚠️  TOKEN EXPIRED or INVALID.");
        console.log("   The Facebook login needs to be refreshed.");
        console.log("   Use the 'simple_fix' OAuth flow in the OpenReply UI.");
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Script failed:", e);
  process.exit(1);
});