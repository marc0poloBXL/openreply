/**
 * TEMP (never committed): Try subscribed_apps via graph.facebook.com with Page token.
 * The Page token may have authority to subscribe a different app.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { decryptToken } from "../lib/meta/oauth";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

const IG_ID = "17841438935909153";
const APP_1051 = "1051360407668084";
const VERSION = process.env.META_GRAPH_API_VERSION ?? "v25.0";
const SUBSCRIBED_FIELDS = ["comments", "messages", "messaging_optins", "mentions"];

function prefix(s: string): string { return s.length > 8 ? s.slice(0, 8) + "..." : s; }

async function main() {
  console.log("=== Reading InstagramAccount from DB ===");
  const account = await prisma.instagramAccount.findUnique({ where: { instagramId: IG_ID } });
  if (!account) { console.log("❌ No row found."); await prisma.$disconnect(); return; }

  const igaaToken = account.accessToken ? decryptToken(account.accessToken) : null;
  const pageToken = account.pageToken ? decryptToken(account.pageToken) : null;
  console.log(`IGAA token present: ${!!igaaToken}  prefix=${igaaToken ? prefix(igaaToken) : "N/A"}`);
  console.log(`Page token present: ${!!pageToken}  prefix=${pageToken ? prefix(pageToken) : "N/A"}`);

  // ── Try via graph.facebook.com with Page token ──
  if (pageToken) {
    console.log("\n=== Approach A: graph.facebook.com + Page token ===");
    const fbUrl = `https://graph.facebook.com/${VERSION}/${IG_ID}/subscribed_apps`;

    // GET current
    const getRes = await fetch(fbUrl, { headers: { Authorization: `Bearer ${pageToken}` } });
    const getBody = await getRes.json() as Record<string, unknown>;
    if (getRes.ok) {
      const apps = getBody.data as Array<{ id: string }> | undefined;
      console.log(`  GET: subscribed apps = ${apps?.map(a => a.id).join(", ") || "(none)"}`);

      // DELETE current
      for (const app of apps ?? []) {
        const delUrl = `${fbUrl}?subscribed_app=${app.id}`;
        const delRes = await fetch(delUrl, { method: "DELETE", headers: { Authorization: `Bearer ${pageToken}` } });
        const delBody = await delRes.json();
        console.log(`  DELETE ${app.id}: HTTP ${delRes.status} ${JSON.stringify(delBody).slice(0, 100)}`);
      }

      // POST to subscribe app 1051
      const postUrl = `${fbUrl}?subscribed_app=${APP_1051}&fields=${SUBSCRIBED_FIELDS.join(",")}`;
      const postRes = await fetch(postUrl, { method: "POST", headers: { Authorization: `Bearer ${pageToken}` } });
      const postBody = await postRes.json() as Record<string, unknown>;
      console.log(`  POST app 1051: HTTP ${postRes.status} ${JSON.stringify(postBody).slice(0, 150)}`);

      // Verify
      const verifyGet = await fetch(fbUrl, { headers: { Authorization: `Bearer ${pageToken}` } });
      const verifyBody = await verifyGet.json() as Record<string, unknown>;
      if (verifyGet.ok) {
        const verifyApps = verifyBody.data as Array<{ id: string }> | undefined;
        const isDone = verifyApps?.some(a => a.id === APP_1051);
        console.log(`  Verify: ${isDone ? "✅ App 1051 subscribed!" : "❌ Still not app 1051 — " + (verifyApps?.map(a => a.id).join(", ") || "(none)")}`);
      }
    } else {
      const err = getBody.error as { message?: string; code?: number } | undefined;
      console.log(`  GET failed: HTTP ${getRes.status} code=${err?.code} ${err?.message?.slice(0, 120)}`);
    }
  } else {
    console.log("\n⚠️  No Page token stored. Skipping Approach A.");
  }

  // ── Try via graph.instagram.com with IGAA token but different approach ──
  if (igaaToken) {
    console.log("\n=== Approach B: graph.instagram.com + IGAA, try without 'subscribed_app' param ===");
    const url = `https://graph.instagram.com/${VERSION}/${IG_ID}/subscribed_apps`;

    // POST without subscribed_app — just fields (may default to current app)
    const postUrl = `${url}?fields=${SUBSCRIBED_FIELDS.join(",")}`;
    const postRes = await fetch(postUrl, { method: "POST", headers: { Authorization: `Bearer ${igaaToken}` } });
    const postBody = await postRes.json() as Record<string, unknown>;
    console.log(`  POST (no app param): HTTP ${postRes.status} ${JSON.stringify(postBody).slice(0, 150)}`);

    // GET to verify
    const getRes = await fetch(url, { headers: { Authorization: `Bearer ${igaaToken}` } });
    const getBody = await getRes.json() as Record<string, unknown>;
    if (getRes.ok) {
      const apps = getBody.data as Array<{ id: string; name?: string }> | undefined;
      console.log(`  Verify: ${apps?.map(a => `${a.id}${a.name ? " (" + a.name + ")" : ""}`).join(", ") || "(none)"}`);
      const isDone = apps?.some(a => a.id === APP_1051);
      console.log(`  Result: ${isDone ? "✅ App 1051 subscribed!" : "❌ Not app 1051"}`);
      if (!isDone && apps?.[0]) {
        console.log(`\n⚠️  Current app ID: ${apps[0].id}`);
        console.log(`   The IGAA token was issued by this app, not by app 1051.`);
        console.log(`   Need to re-issue the IGAA token through app 1051's OAuth flow.`);
      }
    } else {
      const err = getBody.error as { message?: string } | undefined;
      console.log(`  GET failed: ${err?.message?.slice(0, 120)}`);
    }
  }

  await prisma.$disconnect();
}
main();