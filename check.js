const { decryptToken } = require("./lib/meta/oauth");
const { PrismaClient } = require("@prisma/client");

const p = new PrismaClient();

async function main() {
  const campaigns = await p.automation.findMany({ where: { isActive: true } });
  console.log("Active campaigns:", campaigns.length);
  for (const c of campaigns) {
    console.log('  "' + c.name + '" keywords=' + JSON.stringify(c.keywords) + " matchAny=" + c.matchAnyPost);
  }

  const accounts = await p.instagramAccount.findMany();
  for (const a of accounts) {
    try {
      const token = decryptToken(a.accessToken);
      const prefix = token.substring(0, 15);
      const type = token.startsWith("EA") ? "EA (Page token - CORRECT)" : token.startsWith("IGAA") ? "IGAA (Instagram token - WRONG)" : "OTHER";
      console.log("  @" + a.username + ': token starts with "' + prefix + '..." => ' + type);
    } catch (e) {
      console.log("  @" + a.username + ": ERROR - " + e.message);
    }
  }

  const recent = new Date(Date.now() - 3600000);
  const dms = await p.dmLog.count({ where: { createdAt: { gte: recent } } });
  const events = await p.operationalEvent.count({ where: { createdAt: { gte: recent } } });
  console.log("Last hour: " + dms + " DM logs, " + events + " operational events");

  await p.$disconnect();
}

main().catch(function (e) { console.error("ERROR:", e.message); p.$disconnect(); });