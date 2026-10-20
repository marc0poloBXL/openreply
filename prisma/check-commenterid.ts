import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL environment variable is required");
const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

async function main() {
  const dayStart = new Date("2026-10-20T00:00:00Z");
  const log = await prisma.dmLog.findFirst({
    where: { createdAt: { gte: dayStart } },
    orderBy: { createdAt: "asc" },
  });
  if (!log) { console.log("no dmLog"); return; }
  console.log("dmLog row:");
  console.log("  commenterId:   ", log.commenterId);
  console.log("  commenterName: ", log.commenterName);
  console.log("  commentId:     ", log.commentId);
  console.log("  automationId:  ", log.automationId);
  console.log("  status:        ", log.status);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => { console.error(err); await prisma.$disconnect(); process.exit(1); });