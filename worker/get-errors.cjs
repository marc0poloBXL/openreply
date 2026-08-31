require("tsx/cjs");
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });
const { prisma } = require("../lib/db/client");

async function main() {
  const ev = await prisma.operationalEvent.findFirst({
    where: { message: { contains: "sweep" } },
    orderBy: { createdAt: "desc" }
  });
  if (ev) {
    console.log("Message:", ev.message);
    console.log("Level:", ev.level);
    console.log("Created:", ev.createdAt);
    console.log("Payload:", JSON.stringify(ev.payload, null, 2));
  } else {
    console.log("No sweep events found");
    // Try getting any recent events
    const recent = await prisma.operationalEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { message: true, level: true, createdAt: true }
    });
    console.log("\nRecent events:");
    for (const r of recent) {
      console.log(`[${r.level}] ${r.createdAt}: ${r.message}`);
    }
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });