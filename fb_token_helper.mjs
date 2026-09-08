#!/usr/bin/env node
/**
 * Facebook Page Token Helper
 *
 * Gets a fresh Page Access Token with minimal browser interaction.
 *
 * HOW IT WORKS:
 * 1. Starts a local HTTP server on port 3123
 * 2. Prints a Facebook Login URL — you click it
 * 3. You log in, Facebook redirects to the local server
 * 4. Script exchanges the code for a token, gets the Page token
 * 5. Subscribes webhooks and stores the token
 *
 * USAGE:
 *   node fb_token_helper.mjs
 */

import http from "http";
import crypto from "crypto";
import { Client } from "pg";

const APP_ID = "1051360407668084";
const APP_SECRET = process.env.FACEBOOK_APP_SECRET;
if (!APP_SECRET) {
  console.error("❌ FACEBOOK_APP_SECRET is not set in environment.");
  console.error("   Set it via: export FACEBOOK_APP_SECRET=your_secret");
  process.exit(1);
}
const REDIRECT_PORT = 3123;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const API_VERSION = "v26.0";
const IG_ID = "17841438935909153";
const PAGE_ID = "61594011424463";
const CALLBACK_URL = "https://openreply-zeta-ruby.vercel.app/api/webhook";
const VERIFY_TOKEN = "stoiczodiac-webhook-2026";
const SCOPES = ["pages_show_list", "pages_read_engagement"];

function generateState() {
  return crypto.randomBytes(16).toString("hex");
}

function oauthUrl(state) {
  const url = new URL(`https://www.facebook.com/${API_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", APP_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

// Exchange authorization code for user access token
async function exchangeCode(code) {
  const url = new URL(`https://graph.facebook.com/${API_VERSION}/oauth/access_token`);
  url.searchParams.set("client_id", APP_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("client_secret", APP_SECRET);
  url.searchParams.set("code", code);
  const resp = await fetch(url.toString());
  return resp.json();
}

// Get long-lived user token
async function extendToken(shortToken) {
  const url = new URL(`https://graph.facebook.com/${API_VERSION}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", APP_ID);
  url.searchParams.set("client_secret", APP_SECRET);
  url.searchParams.set("fb_exchange_token", shortToken);
  const resp = await fetch(url.toString());
  return resp.json();
}

// Get pages list with page tokens
async function getPages(userToken) {
  const url = new URL(`https://graph.facebook.com/${API_VERSION}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");
  url.searchParams.set("access_token", userToken);
  const resp = await fetch(url.toString());
  return resp.json();
}

// Subscribe Instagram account to webhooks
async function subscribeWebhooks(pageToken) {
  console.log("\n--- Subscribing Instagram account to webhooks ---");

  // App-level subscription
  const appToken = `${APP_ID}|${APP_SECRET}`;
  const appSub = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${APP_ID}/subscriptions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: appToken,
        object: "instagram",
        callback_url: CALLBACK_URL,
        verify_token: VERIFY_TOKEN,
        fields: "comments,messages",
      }),
    }
  );
  const appResult = await appSub.json();
  console.log("  App subscription:", appResult.success ? "✅" : "⚠️", JSON.stringify(appResult));

  // Per-account subscription (requires Page token)
  const igSub = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${IG_ID}/subscribed_apps`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: pageToken,
        subscribed_fields: "comments,messages",
      }),
    }
  );
  const igResult = await igSub.json();
  console.log("  Account subscription:", igResult.success || igResult.id ? "✅" : "❌", JSON.stringify(igResult));
  return igResult.success || igResult.id;
}

// Store the page token in the database
async function storeToken(pageToken) {
  if (!process.env.DATABASE_URL && !process.env.ENCRYPTION_KEY) {
    console.log("\n⚠️ No DB credentials in environment. Token not stored.");
    console.log("   Here is your page token (save it somewhere safe):");
    console.log("   " + pageToken);
    return false;
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(pageToken, "utf8"), cipher.final()]);
  const combined = Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");

  await client.query('UPDATE "InstagramAccount" SET "pageToken" = $1', [combined]);
  console.log("\n✅ Page token encrypted and stored in database.");
  await client.end();
  return true;
}

async function main() {
  console.log("╔═══════════════════════════════════════════════════╗");
  console.log("║     Facebook Page Token Helper for OpenReply      ║");
  console.log("╚═══════════════════════════════════════════════════╝");
  console.log(`Instagram: @stoiczodiac (${IG_ID})`);
  console.log(`App: ${APP_ID}\n`);

  const state = generateState();
  let server;

  // Wait for the OAuth callback
  const code = await new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);

      if (url.pathname === "/callback") {
        const returnedState = url.searchParams.get("state");
        const authCode = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end(`OAuth error: ${error}\n${url.searchParams.get("error_description") || ""}`);
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (returnedState !== state) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("State mismatch — possible CSRF attack");
          reject(new Error("State mismatch"));
          return;
        }

        if (!authCode) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("No authorization code received");
          reject(new Error("No code"));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html><body style="font-family:sans-serif;text-align:center;padding:60px">
            <h2>✅ Authorization received!</h2>
            <p>You can close this tab and go back to the terminal.</p>
          </body></html>
        `);
        resolve(authCode);
      } else if (url.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Waiting for Facebook OAuth redirect...");
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(`📍 Local server listening on http://localhost:${REDIRECT_PORT}`);
      console.log(`\n👉 Click this link to authorize with Facebook:\n`);
      console.log(`    ${oauthUrl(state)}`);
      console.log(`\n📝 After clicking, log into Facebook when prompted.`);
      console.log(`   The script will handle everything after that.\n`);
      console.log("⏳ Waiting for authorization...");
    });
  });

  // Close the local server
  server.close();

  try {
    // Step 1: Exchange code for short-lived user token
    console.log("\n--- Step 1: Exchanging authorization code for token ---");
    const tokenData = await exchangeCode(code);
    if (tokenData.error) {
      console.error("❌ Exchange failed:", tokenData.error.message);
      if (tokenData.error.error_user_msg) console.error("   ", tokenData.error.error_user_msg);
      process.exit(1);
    }
    console.log("✅ User access token obtained (short-lived)");

    // Step 2: Extend to long-lived token
    console.log("\n--- Step 2: Extending to long-lived token ---");
    const longTokenData = await extendToken(tokenData.access_token);
    if (longTokenData.error) {
      console.error("❌ Extension failed:", longTokenData.error.message);
      process.exit(1);
    }
    console.log("✅ Long-lived user token obtained");

    // Step 3: Get pages
    console.log("\n--- Step 3: Getting pages ---");
    const pagesData = await getPages(longTokenData.access_token);
    if (pagesData.error) {
      console.error("❌ Failed to get pages:", pagesData.error.message);
      process.exit(1);
    }

    if (!pagesData.data || pagesData.data.length === 0) {
      console.error("❌ No pages found. Make sure you have a Facebook Page.");
      process.exit(1);
    }

    console.log(`\nFound ${pagesData.data.length} pages:`);
    for (const page of pagesData.data) {
      const ig = page.instagram_business_account;
      console.log(`   📄 ${page.name}${ig ? ` → IG: @${ig.username} (${ig.id})` : ""}`);
    }

    // Find the Stoic Zodiac page
    const stoicPage = pagesData.data.find(p =>
      p.instagram_business_account?.id === IG_ID ||
      p.id === PAGE_ID ||
      p.name?.toLowerCase().includes("stoic")
    );

    if (!stoicPage) {
      console.error(`\n❌ Could not find "Stoic Zodiac" page in your accounts.`);
      console.log(`   Available pages: ${pagesData.data.map(p => `"${p.name}"`).join(", ")}`);
      process.exit(1);
    }

    console.log(`\n✅ Found page: "${stoicPage.name}"`);
    const pageToken = stoicPage.access_token;
    console.log(`   Token prefix: ${pageToken.substring(0, 20)}...`);

    // Step 4: Subscribe webhooks
    const subscribed = await subscribeWebhooks(pageToken);

    // Step 5: Store token
    await storeToken(pageToken);

    console.log("\n" + "=".repeat(50));
    if (subscribed) {
      console.log("✅✅✅ ALL DONE! Webhook subscribed successfully.");
      console.log("   OpenReply is now live — comments will auto-reply.");
    } else {
      console.log("⚠️ Done, but webhook subscription may need attention.");
      console.log("   Check the error above.");
    }
    console.log("=".repeat(50));

  } catch (e) {
    console.error("\n❌ Fatal:", e.message);
    process.exit(1);
  }
}

main();