/**
 * Diagnose webhook subscription and token capabilities directly.
 *
 * Bypasses debugToken() (which now correctly routes all tokens to graph.facebook.com,
 * but was originally hitting a routing bug where IGAA tokens went to the wrong
 * base URL). Instead calls the same endpoints the app uses at runtime.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { decryptToken } from "../lib/meta/oauth";
import { requireEnv, getMetaGraphApiVersion } from "../lib/env";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const IG_USER_ID = "17841438935909153";

async function main() {
  const account = await prisma.instagramAccount.findUnique({
    where: { instagramId: IG_USER_ID },
  });
  if (!account) {
    console.error("InstagramAccount not found");
    process.exit(1);
  }

  const igaaToken = account.accessToken ? decryptToken(account.accessToken) : null;
  if (!igaaToken) {
    console.error("No IGAA token found");
    process.exit(1);
  }

  const ver = getMetaGraphApiVersion();
  const igBase = `https://graph.instagram.com/${ver}`;
  const fbBase = `https://graph.facebook.com/${ver}`;

  console.log("=== ACCOUNT ===");
  console.log("Username:", account.username);
  console.log("Token prefix:", igaaToken.slice(0, 20) + "...");
  console.log("Token type:", igaaToken.startsWith("EA") ? "EA (Page token)" : "IGAA (IG token)");
  console.log("API version:", ver);
  console.log("Expires at:", account.tokenExpiresAt?.toISOString() ?? "unknown");

  // ── 1. Test token on its native endpoint: GET /me on graph.instagram.com ──
  console.log("\n=== 1. GET /me on graph.instagram.com ===");
  try {
    const meUrl = new URL(`${igBase}/me`);
    meUrl.searchParams.set("fields", "user_id,username,name,account_type");
    meUrl.searchParams.set("access_token", igaaToken);
    const meResp = await fetch(meUrl.toString());
    const meData = await meResp.json();
    if (meResp.ok) {
      console.log("SUCCESS:", JSON.stringify(meData, null, 2));
    } else {
      console.log("FAILED:", JSON.stringify(meData, null, 2));
    }
  } catch (e: any) {
    console.error("ERROR:", e.message ?? e);
  }

  // ── 2. Check webhook subscription: GET /{ig-user-id}/subscribed_apps ──
  console.log("\n=== 2. GET subscribed_apps on graph.instagram.com ===");
  try {
    const subUrl = new URL(`${igBase}/${IG_USER_ID}/subscribed_apps`);
    subUrl.searchParams.set("access_token", igaaToken);
    const subResp = await fetch(subUrl.toString());
    const subData = await subResp.json();
    if (subResp.ok) {
      console.log("SUCCESS:", JSON.stringify(subData, null, 2));
    } else {
      console.log("FAILED:", JSON.stringify(subData, null, 2));
    }
  } catch (e: any) {
    console.error("ERROR:", e.message ?? e);
  }

  // ── 3. Try subscribed_apps via graph.facebook.com (works for some IGAA tokens) ──
  console.log("\n=== 3. GET subscribed_apps on graph.facebook.com ===");
  try {
    const fbSubUrl = new URL(`${fbBase}/${IG_USER_ID}/subscribed_apps`);
    fbSubUrl.searchParams.set("access_token", igaaToken);
    const fbSubResp = await fetch(fbSubUrl.toString());
    const fbSubData = await fbSubResp.json();
    if (fbSubResp.ok) {
      console.log("SUCCESS:", JSON.stringify(fbSubData, null, 2));
    } else {
      console.log("FAILED:", JSON.stringify(fbSubData, null, 2));
    }
  } catch (e: any) {
    console.error("ERROR:", e.message ?? e);
  }

  // ── 4. Try Conversations API via graph.instagram.com ──
  console.log("\n=== 4. GET conversations on graph.instagram.com ===");
  try {
    const convUrl = new URL(`${igBase}/${IG_USER_ID}/conversations`);
    convUrl.searchParams.set("platform", "instagram");
    convUrl.searchParams.set("fields", "participants,updated_time,messages.limit(1){message,from,created_time}");
    convUrl.searchParams.set("limit", "5");
    convUrl.searchParams.set("access_token", igaaToken);
    const convResp = await fetch(convUrl.toString());
    const convData = await convResp.json();
    if (convResp.ok) {
      const list = convData.data ?? [];
      console.log("SUCCESS:", list.length, "conversations found");
      if (list.length > 0) {
        list.forEach((c: any) => {
          console.log("  -", c.id, "updated:", c.updated_time, "participants:", c.participants?.data?.length ?? 0);
        });
      }
    } else {
      console.log("FAILED:", JSON.stringify(convData, null, 2));
    }
  } catch (e: any) {
    console.error("ERROR:", e.message ?? e);
  }

  // ── 5. Try debug_token on graph.instagram.com (unusual but worth testing) ──
  console.log("\n=== 5.debug_token on graph.instagram.com (experimental) ===");
  try {
    const fbAppToken = `${requireEnv("FACEBOOK_APP_ID")}|${requireEnv("FACEBOOK_APP_SECRET")}`;
    const dbgUrl = new URL(`${igBase}/debug_token`);
    dbgUrl.searchParams.set("input_token", igaaToken);
    dbgUrl.searchParams.set("access_token", fbAppToken);
    const dbgResp = await fetch(dbgUrl.toString());
    const dbgData = await dbgResp.json();
    if (dbgResp.ok) {
      console.log("SUCCESS:", JSON.stringify(dbgData, null, 2));
    } else {
      console.log("FAILED:", JSON.stringify(dbgData, null, 2));
    }
  } catch (e: any) {
    console.error("ERROR:", e.message ?? e);
  }

  // ── 6. Check conversations API via graph.facebook.com (if it works) ──
  console.log("\n=== 6. GET conversations on graph.facebook.com ===");
  try {
    const convUrl = new URL(`${fbBase}/${IG_USER_ID}/conversations`);
    convUrl.searchParams.set("platform", "instagram");
    convUrl.searchParams.set("fields", "participants,updated_time,messages.limit(1){message,from,created_time}");
    convUrl.searchParams.set("limit", "5");
    convUrl.searchParams.set("access_token", igaaToken);
    const convResp = await fetch(convUrl.toString());
    const convData = await convResp.json();
    if (convResp.ok) {
      const list = convData.data ?? [];
      console.log("SUCCESS:", list.length, "conversations found");
      if (list.length > 0) {
        list.forEach((c: any) => {
          console.log("  -", c.id, "updated:", c.updated_time, "participants:", c.participants?.data?.length ?? 0);
        });
      }
    } else {
      console.log("FAILED:", JSON.stringify(convData, null, 2));
    }
  } catch (e: any) {
    console.error("ERROR:", e.message ?? e);
  }

  console.log("\n=== DONE ===");
}

main()
  .catch((e) => {
    console.error("Script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });