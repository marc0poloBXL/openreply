/**
 * TEMP (never committed): Test DM API functionality for @stoiczodiac.
 * Verifies the IGAA token can read conversations and basic IG user info.
 *
 * Run: npx tsx prisma/_tmp-test-dm.ts
 * Prints no secrets (only prefixes).
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { decryptToken } from "../lib/meta/oauth";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

const IG_ID = "17841438935909153";
const VERSION = process.env.META_GRAPH_API_VERSION ?? "v25.0";

function prefix(s: string): string {
  return s.length > 8 ? s.slice(0, 8) + "..." : s;
}

async function main() {
  console.log("=== Reading InstagramAccount from DB ===");
  const account = await prisma.instagramAccount.findUnique({
    where: { instagramId: IG_ID },
  });
  if (!account) {
    console.log("❌ No InstagramAccount row found.");
    await prisma.$disconnect();
    return;
  }

  const token = decryptToken(account.accessToken);
  console.log(`IGAA token prefix: ${prefix(token)}`);

  // ── 1) Test GET /me (basic IG user info) ──
  console.log("\n=== Test: GET /me ===");
  const meUrl = `https://graph.instagram.com/${VERSION}/${IG_ID}?fields=id,username,name`;
  const meRes = await fetch(meUrl, { headers: { Authorization: `Bearer ${token}` } });
  const meBody = await meRes.json() as Record<string, unknown>;
  if (meRes.ok) {
    console.log(`✅ /me: username=${meBody.username}, name=${meBody.name}`);
  } else {
    const err = meBody.error as { message?: string; code?: number } | undefined;
    console.log(`❌ /me failed: HTTP ${meRes.status} — ${err ? `code=${err.code} ${err.message}` : JSON.stringify(meBody).slice(0, 200)}`);
  }

  // ── 2) Test GET conversations (DM inbox) ──
  console.log("\n=== Test: GET conversations ===");
  const convUrl = `https://graph.instagram.com/${VERSION}/${IG_ID}/conversations?platform=messenger`;
  const convRes = await fetch(convUrl, { headers: { Authorization: `Bearer ${token}` } });
  const convBody = await convRes.json() as Record<string, unknown>;

  if (convRes.ok) {
    const data = convBody.data as Array<Record<string, unknown>> | undefined;
    console.log(`✅ Conversations: HTTP ${convRes.status}, ${data?.length ?? 0} conversations`);
    if (data && data.length > 0) {
      for (const c of data.slice(0, 3)) {
        const participants = (c.participants as { data?: Array<Record<string, unknown>> })?.data;
        const usernames = participants?.map((p: Record<string, unknown>) => p.username).join(", ") ?? "?";
        console.log(`  - id=${(c.id as string)?.slice(0, 20) ?? "?"} participants: ${usernames}`);
      }
    }
  } else {
    const err = convBody.error as { message?: string; code?: number } | undefined;
    console.log(`❌ Conversations failed: HTTP ${convRes.status} — ${err ? `code=${err.code} ${err.message}` : JSON.stringify(convBody).slice(0, 300)}`);
  }

  await prisma.$disconnect();
}

main();