/**
 * TEMP helper (4 nov 2026) — LECTURE SEULE. Interroge le dossier "message requests"
 * de @stoiczodiac via l'API Graph, pour voir si des demandes de messages de
 * visiteurs y sont bloquées (elles ne déclenchent pas les webhooks tant que
 * non acceptées). Aucun secret affiché — que des booléens + compteurs.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { decryptToken } from "../lib/meta/oauth";
import { getMetaGraphApiVersion } from "../lib/env";

const { PrismaClient } = require("../app/generated/prisma/client");
const adapter = new PrismaPg(process.env["DATABASE_URL"]!);
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
  const token = account.accessToken ? decryptToken(account.accessToken) : null;
  if (!token) {
    console.error("No token found");
    process.exit(1);
  }

  const ver = getMetaGraphApiVersion();
  const igBase = `https://graph.instagram.com/${ver}`;

  // 1. Conversations normales (inbox)
  try {
    const u = new URL(`${igBase}/me/conversations`);
    u.searchParams.set("platform", "instagram");
    u.searchParams.set("access_token", token);
    const r = await fetch(u.toString());
    const d = await r.json();
    const convs = d.data ?? [];
    console.log("INBOX (conversations normales) :", convs.length, "conversation(s)");
  } catch (e: any) {
    console.log("INBOX : FAILED", e.message);
  }

  // 2. Dossier message requests
  try {
    const u = new URL(`${igBase}/me/conversations`);
    u.searchParams.set("platform", "instagram");
    u.searchParams.set("folder", "requests");
    u.searchParams.set("access_token", token);
    const r = await fetch(u.toString());
    const d = await r.json();
    if (d.error) {
      console.log("MESSAGE REQUESTS :", d.error.code, "-", d.error.message);
      return;
    }
    const convs = d.data ?? [];
    console.log("MESSAGE REQUESTS (demandes) :", convs.length, "conversation(s)");
    for (const c of convs.slice(0, 10)) {
      console.log("  - id:", c.id, "| participants:", (c.participants?.data ?? []).map((p: any) => p.username ?? p.name ?? "?").join(", "));
    }
  } catch (e: any) {
    console.log("MESSAGE REQUESTS : FAILED", e.message);
  }
}

main().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});