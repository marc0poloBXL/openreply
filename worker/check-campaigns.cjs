require("tsx/cjs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
const { prisma } = require("../lib/db/client");

async function main() {
  // Insta accounts
  const accounts = await prisma.instagramAccount.findMany();
  console.log("=== INSTAGRAM ACCOUNTS ===");
  for (const a of accounts) {
    console.log(`ID: ${a.id} | @${a.username} | workspace: ${a.workspaceId} | token: ${a.accessToken ? "✅" : "❌"} | webhook: ${a.webhookSubscribed ? "✅" : "❌"}`);
  }

  // Automations (campaigns)
  const automations = await prisma.automation.findMany({ include: { instagramAccount: { select: { username: true } } } });
  console.log("\n=== CAMPAIGNS ===");
  if (automations.length === 0) {
    console.log("No campaigns found.");
  }
  for (const a of automations) {
    console.log(`ID: ${a.id} | Name: "${a.name}" | active: ${a.isActive} | keywords: ${a.keywords?.join(", ")} | account: @${a.instagramAccount?.username}`);
  }

  // Workspaces
  const workspaces = await prisma.workspace.findMany();
  console.log("\n=== WORKSPACES ===");
  for (const w of workspaces) {
    console.log(`ID: ${w.id} | Name: ${w.name}`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });