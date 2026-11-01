/**
 * Diagnose the stored IGAA and Page tokens: call debugToken() on each to inspect
 * their scopes, type, expiry, and validity.
 *
 * This tells us whether the Instagram app actually has `instagram_manage_messages`
 * permission — if not, the webhook *can't* receive user DM text events regardless
 * of subscription setup.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { decryptToken } from "../lib/meta/oauth";
import { debugToken } from "../lib/meta/client";
import { requireEnv } from "../lib/env";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const fbAppToken = `${requireEnv("FACEBOOK_APP_ID")}|${requireEnv("FACEBOOK_APP_SECRET")}`;
  console.log("Facebook App Token prefix:", fbAppToken.slice(0, 20) + "...");

  // 1. Load the Instagram account
  const account = await prisma.instagramAccount.findUnique({
    where: { instagramId: "17841438935909153" },
  });
  if (!account) {
    console.error("InstagramAccount not found for instagramId 17841438935909153");
    process.exit(1);
  }
  console.log("\n=== ACCOUNT ===");
  console.log("Username:", account.username);
  console.log("Has accessToken:", !!account.accessToken);
  console.log("Has pageToken:", !!account.pageToken);
  console.log("TokenExpiresAt:", account.tokenExpiresAt?.toISOString() ?? "none");

  // 2. Decrypt both tokens
  const igaaToken = account.accessToken ? decryptToken(account.accessToken) : null;
  const pageToken = account.pageToken ? decryptToken(account.pageToken) : null;

  if (igaaToken) {
    console.log("\n=== IGAA TOKEN (first 20 chars) ===");
    console.log(igaaToken.slice(0, 20) + "...");
    console.log("Starts with EA?", igaaToken.startsWith("EA"));  // should route to graph.facebook.com or graph.instagram.com
    try {
      const result = await debugToken(igaaToken, fbAppToken) as any;
      console.log("\n--- debugToken(igaaToken) ---");
      console.log("is_valid:", result.data?.is_valid);
      console.log("type:", result.data?.type);
      console.log("app_id:", result.data?.app_id);
      console.log("application:", result.data?.application);
      console.log("expires_at:", result.data?.expires_at);
      console.log("data_access_expires_at:", result.data?.data_access_expires_at);
      console.log("scopes:", JSON.stringify(result.data?.scopes, null, 2));
      console.log("granular_scopes:", JSON.stringify(result.data?.granular_scopes, null, 2));
      // Check for key permissions
      const scopes = result.data?.scopes ?? [];
      const gScopes = (result.data?.granular_scopes ?? []).map((gs: any) => gs.scope);
      const allScopes = [...scopes, ...gScopes];
      console.log("\n--- Permission checks (IGAA) ---");
      console.log("instagram_manage_messages:", allScopes.includes("instagram_manage_messages"));
      console.log("instagram_business_basic:", allScopes.includes("instagram_business_basic"));
      console.log("instagram_business_manage_messages:", allScopes.includes("instagram_business_manage_messages"));
      console.log("instagram_business_manage_comments:", allScopes.includes("instagram_business_manage_comments"));
      console.log("pages_messaging:", allScopes.includes("pages_messaging"));
      console.log("pages_manage_metadata:", allScopes.includes("pages_manage_metadata"));
      console.log("pages_read_engagement:", allScopes.includes("pages_read_engagement"));
      console.log("pages_show_list:", allScopes.includes("pages_show_list"));
      console.log("business_management:", allScopes.includes("business_management"));
    } catch (e: any) {
      console.error("debugToken(igaaToken) FAILED:", e.message ?? e);
    }
  } else {
    console.log("\n=== IGAA TOKEN ===");
    console.log("NOT AVAILABLE (null)");
  }

  if (pageToken) {
    console.log("\n=== PAGE TOKEN (first 20 chars) ===");
    console.log(pageToken.slice(0, 20) + "...");
    console.log("Starts with EA?", pageToken.startsWith("EA"));  // should route to graph.facebook.com
    try {
      const result = await debugToken(pageToken, fbAppToken) as any;
      console.log("\n--- debugToken(pageToken) ---");
      console.log("is_valid:", result.data?.is_valid);
      console.log("type:", result.data?.type);
      console.log("app_id:", result.data?.app_id);
      console.log("application:", result.data?.application);
      console.log("expires_at:", result.data?.expires_at);
      console.log("scopes:", JSON.stringify(result.data?.scopes, null, 2));
      console.log("granular_scopes:", JSON.stringify(result.data?.granular_scopes, null, 2));
      const scopes = result.data?.scopes ?? [];
      const gScopes = (result.data?.granular_scopes ?? []).map((gs: any) => gs.scope);
      const allScopes = [...scopes, ...gScopes];
      console.log("\n--- Permission checks (Page) ---");
      console.log("pages_messaging:", allScopes.includes("pages_messaging"));
      console.log("pages_manage_metadata:", allScopes.includes("pages_manage_metadata"));
      console.log("pages_read_engagement:", allScopes.includes("pages_read_engagement"));
      console.log("pages_show_list:", allScopes.includes("pages_show_list"));
      console.log("business_management:", allScopes.includes("business_management"));
      console.log("instagram_basic:", allScopes.includes("instagram_basic"));
      console.log("instagram_manage_messages:", allScopes.includes("instagram_manage_messages"));
    } catch (e: any) {
      console.error("debugToken(pageToken) FAILED:", e.message ?? e);
    }
  } else {
    console.log("\n=== PAGE TOKEN ===");
    console.log("NOT AVAILABLE (null)");
  }

  // 3. Summary
  console.log("\n=== SUMMARY ===");
  if (igaaToken) console.log("IGAA token: PRESENT, routing to", igaaToken.startsWith("EA") ? "graph.facebook.com" : "graph.instagram.com");
  if (pageToken) console.log("Page token: PRESENT, routing to", pageToken.startsWith("EA") ? "graph.facebook.com" : "graph.instagram.com");
  console.log("If instagram_manage_messages is missing: App Review needed for pages_messaging or instagram_business_manage_messages");
  console.log("If token type is USER instead of PAGE: subscription should use /{ig-user-id}/subscribed_apps");
  console.log("If token type is PAGE: subscription should use /{page-id}/subscribed_apps");
}

main()
  .catch((e) => {
    console.error("Script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });