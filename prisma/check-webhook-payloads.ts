/**
 * Read-only dump of what webhook events arrived today — counts per entry
 * type (comment / postback / message / read) so we can see whether the
 * button tap ever reached the app. Prints NO tokens, no message bodies.
 *
 * Run: npx tsx prisma/check-webhook-payloads.ts
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL environment variable is required");
const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

function entryType(payload: any): string {
  if (!payload || !payload.entry) return "?";
  const kinds: string[] = [];
  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      const f = change?.field ?? "?";
      const v = change?.value ?? {};
      if (f === "comments") {
        kinds.push(`comment(from=${v.from?.username ?? v.from?.id ?? "?"})`);
      } else if (f === "messaging_postbacks") {
        const ps = Array.isArray(v) ? v : [v];
        for (const p of ps) {
          kinds.push(`postback(mid=${(p?.mid ?? "?").slice(-12)})`);
        }
      } else if (f === "messages") {
        const ms = Array.isArray(v) ? v : [v];
        for (const m of ms) {
          kinds.push(`message(from=${m?.from?.id?.slice?.(0, 6) ?? "?"},mid=${(m?.mid ?? "?").slice(-12)})`);
        }
      } else if (f === "messaging" || f === "messaging_seen") {
        kinds.push(`messaging(${f})`);
      } else {
        kinds.push(`other(${f})`);
      }
    }
  }
  return kinds.join(" | ") || "(no changes)";
}

async function main() {
  const dayStart = new Date("2026-10-20T00:00:00Z");
  const events = await prisma.webhookEvent.findMany({
    where: { createdAt: { gte: dayStart } },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Today: ${events.length} webhook event(s)\n`);
  for (const e of events) {
    const payload = e.payload as any;
    console.log(`  ${e.createdAt.toISOString()} [${e.status}]`);
    console.log(`    object: ${e.object}`);

    // Top-level shape
    const objectId = payload?.entry?.[0]?.id;
    if (objectId) console.log(`    entry.id: ${objectId}`);
    console.log(`    entries: ${entryType(payload)}`);

    // Raw "field" names present in changes, to catch anything unexpected
    const fields = new Set<string>();
    for (const entry of payload?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        fields.add(change?.field ?? "?");
      }
    }
    console.log(`    fields seen: ${[...fields].join(", ") || "(none)"}`);
    console.log("");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("Check failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });