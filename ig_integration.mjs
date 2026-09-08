#!/usr/bin/env node
/**
 * Instagram DM Automation — Meta Graph API Integration
 *
 * Usage:
 *   node ig_integration.mjs <page-token>
 *
 * Where <page-token> is a Facebook Page Access Token (EA-prefixed)
 * for the Stoic Zodiac page.
 *
 * This script:
 *   1. Subscribes the Instagram account to webhooks
 *   2. Tests reading comments from recent posts
 *   3. Starts a local webhook listener (for testing)
 *   4. Shows how to send a DM reply
 */

import { Client } from "pg";
import crypto from "crypto";
import { createServer } from "http";

const IG_ID = "17841438935909153";  // @stoiczodiac
const PAGE_ID = "61594011424463";   // Stoic Zodiac Facebook Page
const APP_ID = "1051360407668084"; // stoiczodiac-dm
const API_VERSION = "v26.0";
const CALLBACK_URL = "https://openreply-zeta-ruby.vercel.app/api/webhook";
const VERIFY_TOKEN = "stoiczodiac-webhook-2026";

// ============================================================
// STEP 0: Encrypt & store the page token in the database
// ============================================================
async function storePageToken(pageToken) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(pageToken, "utf8"), cipher.final()]);
  const combined = Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");

  await client.query('UPDATE "InstagramAccount" SET "pageToken" = $1', [combined]);
  console.log("✅ Page token encrypted and stored in database.");
  await client.end();
}

// ============================================================
// STEP 1: Subscribe Instagram to webhooks
// ============================================================
async function subscribeWebhooks(pageToken) {
  console.log(`\n--- Step 1: Subscribing ${IG_ID} to webhooks ---`);

  // 1a. App-level subscription (already done, but idempotent)
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appSecret) { console.error("❌ FACEBOOK_APP_SECRET not set"); process.exit(1); }
  const appToken = `${APP_ID}|${appSecret}`;
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

  // 1b. Per-account subscription (requires Page token)
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

// ============================================================
// STEP 2: Test reading comments from recent posts
// ============================================================
async function testCommentReading(pageToken) {
  console.log(`\n--- Step 2: Testing comment reading ---`);

  // Get the Instagram Business Account info via the Page token
  const pageResp = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${PAGE_ID}?fields=name,instagram_business_account{id,username}&access_token=${pageToken}`
  );
  const pageData = await pageResp.json();
  console.log("  Page:", pageData.name);
  console.log("  IG Business Account:", pageData.instagram_business_account?.username);

  // Get recent media
  const mediaResp = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${IG_ID}/media?fields=id,caption,timestamp,comments_count&limit=5&access_token=${pageToken}`
  );
  const mediaData = await mediaResp.json();

  if (mediaData.error) {
    console.log("  ❌ Can't read media:", mediaData.error.message);
    return;
  }

  if (!mediaData.data || mediaData.data.length === 0) {
    console.log("  ⚠️ No posts found.");
    return;
  }

  console.log(`  Found ${mediaData.data.length} recent posts`);

  for (const post of mediaData.data) {
    console.log(`  Post ${post.id}: comments=${post.comments_count || 0}, date=${post.timestamp?.substring(0, 10)}`);

    if (post.comments_count > 0) {
      // Read comments — this is the KEY feature that requires a Page token
      const commentsResp = await fetch(
        `https://graph.facebook.com/${API_VERSION}/${post.id}/comments?fields=id,text,from,timestamp&limit=5&access_token=${pageToken}`
      );
      const commentsData = await commentsResp.json();

      if (commentsData.data) {
        for (const comment of commentsData.data) {
          console.log(`    💬 ${comment.from?.name || "Unknown"}: "${comment.text}"`);
        }
      }
    }
  }
}

// ============================================================
// STEP 3: Start a local webhook verification server
// ============================================================
function startWebhookServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, "http://localhost");

      if (req.method === "GET" && url.pathname === "/webhook") {
        // Facebook/Meta webhook verification
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        if (mode === "subscribe" && token === VERIFY_TOKEN) {
          console.log("\n  ✅ Webhook verification challenge accepted!");
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end(challenge);
        } else {
          res.writeHead(403);
          res.end("Forbidden");
        }
      } else if (req.method === "POST" && url.pathname === "/webhook") {
        // Incoming webhook event
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            const event = JSON.parse(body);
            console.log("\n  📩 Webhook received:", JSON.stringify(event, null, 2));

            // Handle Instagram comment/message events
            if (event.entry) {
              for (const entry of event.entry) {
                if (entry.changes) {
                  for (const change of entry.changes) {
                    if (change.field === "comments") {
                      console.log("  💬 New comment event!");
                      const value = change.value;
                      console.log(`     From: ${value.from?.name || "Unknown"}`);
                      console.log(`     Text: ${value.text}`);
                      console.log(`     Media: ${value.media?.id || "N/A"}`);
                    } else if (change.field === "messages") {
                      console.log("  ✉️ New message event!");
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.log("  Error parsing webhook body:", e.message);
          }
          res.writeHead(200);
          res.end("OK");
        });
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(0, () => {
      const port = server.address().port;
      console.log(`\n  🌐 Local webhook listener on http://localhost:${port}/webhook`);
      console.log(`  📌 Verify token: "${VERIFY_TOKEN}"`);
      resolve(server);
    });
  });
}

// ============================================================
// STEP 4: Send a DM reply to a comment
// ============================================================
async function sendDMReply(pageToken, commentId, message) {
  console.log(`\n--- Step 4: Sending DM reply to comment ${commentId} ---`);

  // This uses the Instagram Business Messaging API
  // First, get the user who commented
  const commentResp = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${commentId}?fields=from&access_token=${pageToken}`
  );
  const commentData = await commentResp.json();

  if (commentData.error) {
    console.log("  ❌ Can't get comment info:", commentData.error.message);
    return;
  }

  const userId = commentData.from?.id;
  if (!userId) {
    console.log("  ❌ No user ID in comment");
    return;
  }

  console.log(`  User ID: ${userId}, Sending: "${message}"`);

  // Send a private reply (DM) via the Instagram Messaging API
  // The user ID here is the Instagram-scoped ID (IGID), not a FB ID
  const sendResp = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${IG_ID}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: pageToken,
        recipient: { id: userId },
        message: { text: message },
      }),
    }
  );
  const sendData = await sendResp.json();
  console.log("  Send result:", JSON.stringify(sendData));
  return sendData;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const pageToken = process.argv[2] || process.env.PAGE_TOKEN;

  if (!pageToken) {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Instagram DM Automation — Setup Script                     ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Usage:  node ig_integration.mjs <page-token>                ║
║                                                              ║
║  To get a Page Token (ONE TIME):                             ║
║                                                              ║
║  1. Open this link in your browser:                          ║
║     https://developers.facebook.com/tools/explorer/          ║
║        1051360407668084/                                     ║
║                                                              ║
║  2. Click "Get User Access Token" →                          ║
║     Select pages_show_list, pages_read_engagement →          ║
║     Generate → Continue as Marc Jelen                        ║
║                                                              ║
║  3. Above the token, change "User Token" dropdown            ║
║     to "Page Token" → select "Stoic Zodiac"                  ║
║                                                              ║
║  4. Copy the new token and run:                              ║
║     node ig_integration.mjs YOUR_PAGE_TOKEN                  ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
    return;
  }

  console.log("Page token prefix:", pageToken.substring(0, 15) + "...");
  console.log(`Instagram: @stoiczodiac (${IG_ID})`);
  console.log(`App: ${APP_ID}`);

  // Step 0: Store token in database
  if (process.env.DATABASE_URL && process.env.ENCRYPTION_KEY) {
    await storePageToken(pageToken);
  } else {
    console.log("\n⚠️  No DB credentials — skipping token storage.");
  }

  // Step 1: Subscribe webhooks
  await subscribeWebhooks(pageToken);

  // Step 2: Test comment reading
  await testCommentReading(pageToken);

  // Step 3: Start webhook listener if --listen flag
  if (process.argv.includes("--listen")) {
    await startWebhookServer();
  }

  console.log("\n✅ Integration setup complete!");
  console.log("Visit: https://openreply-zeta-ruby.vercel.app/settings");
  console.log("The webhook status should now show 'connected'.");
}

main().catch((e) => console.error("FATAL:", e.message));