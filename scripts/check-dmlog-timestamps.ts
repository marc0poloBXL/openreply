/**
 * Quick script to verify DmLog timestamps — are they all before Oct 25?
 * This confirms whether the 0 DmFlowState records are expected (pre-fix) or a real bug.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../app/generated/prisma/client";

const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"] });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== DmLog TIMESTAMPS (most recent first) ===");
  const dmlogs = await prisma.dmLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  if (dmlogs.length === 0) {
    console.log("No DmLog records found.");
    return;
  }

  for (const d of dmlogs) {
    const isBeforeOct25 = d.createdAt < new Date("2026-10-25T00:00:00Z");
    const marker = isBeforeOct25 ? " <- BEFORE Oct 25 fix" : " <- ** AFTER Oct 25 fix **";
    console.log(
      d.createdAt.toISOString(),
      "|",
      d.status.padEnd(10),
      "|",
      (d.commenterName ?? d.commenterId ?? "?").padEnd(20),
      "|",
      (d.matchedKeyword ?? "N/A").padEnd(12),
      marker
    );
  }

  const total = dmlogs.length;
  const before = dmlogs.filter((d) => d.createdAt < new Date("2026-10-25T00:00:00Z")).length;
  const after = total - before;
  console.log("\n=== SUMMARY ===");
  console.log("Total DmLogs checked:", total);
  console.log("Before Oct 25 fix:", before);
  console.log("After Oct 25 fix:", after);
  console.log("DmFlowState records: 0 (from previous diagnostic)");

  if (before === total) {
    console.log("\nAll DmLogs predate the Oct 25 fix.");
    console.log("0 DmFlowState records is EXPECTED, not a bug.");
    console.log("\nNEXT STEP: Send a live DM from a 2nd Instagram account to @stoiczodiac");
  } else if (after > 0) {
    console.log("\n" + after + " DmLog(s) are from AFTER the Oct 25 fix.");
    console.log("This means getFlowState() SHOULD have been called but DmFlowState = 0.");
    console.log("The contradiction is REAL -- needs deeper investigation.");
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