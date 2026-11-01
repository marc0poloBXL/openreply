/**
 * Dump raw WebhookEvent payload JSON for the Oct 26 messaging events.
 * This reveals why the diagnostic shows sender=N/A, text=N/A.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../app/generated/prisma/client";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const events = await prisma.webhookEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  console.log(`Found ${events.length} total webhook events\n`);

  for (const e of events) {
    const payload = e.payload as any;
    const entry = payload?.entry?.[0];
    const messaging = entry?.messaging?.[0];
    const changes = entry?.changes?.[0];

    console.log("========================================");
    console.log("ID:        " + e.id);
    console.log("Status:    " + e.status);
    console.log("Created:   " + e.createdAt.toISOString());
    console.log("Processed: " + (e.processedAt?.toISOString() ?? "N/A"));
    console.log("Error:     " + (e.errorMessage ?? "none"));

    console.log("Payload top-level keys:", Object.keys(payload));

    if (entry) {
      console.log("Entry keys:", Object.keys(entry));
    }

    if (messaging) {
      console.log("Messaging keys:", Object.keys(messaging));
      console.log("Messaging sender:", JSON.stringify(messaging.sender));
      console.log("Messaging recipient:", JSON.stringify(messaging.recipient));
      console.log("Messaging timestamp:", messaging.timestamp);
      console.log("Messaging message:", JSON.stringify(messaging.message));
      console.log("Messaging is_echo:", messaging.message?.is_echo);
      console.log("Messaging app_id:", messaging.message?.app_id);
      console.log("Messaging read:", JSON.stringify(messaging.read));
      console.log("Messaging delivery:", JSON.stringify(messaging.delivery));
      console.log("Messaging referral:", JSON.stringify(messaging.referral));
      console.log("Messaging postback:", JSON.stringify(messaging.postback));
      console.log("Messaging reaction:", JSON.stringify(messaging.reaction));
    }

    if (changes) {
      console.log("Changes field:", changes.field);
      console.log("Changes value keys:", Object.keys(changes.value ?? {}));
      console.log("Changes value item:", changes.value?.item);
      console.log("Changes value message:", changes.value?.message);
      console.log("Changes value sender_id:", changes.value?.sender_id);
    }

    const full = JSON.stringify(payload);
    console.log("\nFULL PAYLOAD (truncated 2000 chars):");
    console.log(full.slice(0, 2000));
    if (full.length > 2000) console.log("...[truncated]");
    console.log("\n");
  }
}

main()
  .catch((e) => {
    console.error("Script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });