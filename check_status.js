const path = require('path');
// Try multiple locations for the generated prisma client
let PrismaClient;
try {
  PrismaClient = require(path.join(process.cwd(), 'app/generated/prisma')).PrismaClient;
} catch {
  PrismaClient = require(path.join(process.cwd(), 'node_modules/@prisma/client')).PrismaClient;
}
const p = new PrismaClient();

async function main() {
  // 1. Check active campaigns
  const campaigns = await p.automation.findMany({
    where: { isActive: true },
    include: { instagramAccount: true }
  });
  console.log("=== ACTIVE CAMPAIGNS ===");
  console.log(JSON.stringify(campaigns.map(c => ({
    name: c.name,
    keywords: c.keywords,
    matchAnyPost: c.matchAnyPost,
    isActive: c.isActive,
    instagramUsername: c.instagramAccount?.username,
    instagramId: c.instagramAccount?.instagramId,
    tokenStartsWith: c.instagramAccount?.accessToken?.substring(0, 10) + '...'
  })), null, 2));

  // 2. Check if token is EA (Page token) or IGAA
  console.log("\n=== TOKEN TYPE ===");
  const accounts = await p.instagramAccount.findMany();
  for (const a of accounts) {
    const token = a.accessToken;
    const decrypted = require('./lib/meta/oauth').decryptToken(token);
    console.log(`Account @${a.username}: token starts with "${decrypted.substring(0, 10)}..."`);
    console.log(`  => ${decrypted.startsWith('EA') ? 'PAGE TOKEN (correct for reading comments)' : decrypted.startsWith('IGAA') ? 'IG TOKEN (cannot read other users comments)' : 'OTHER'}`);
  }

  // 3. Count comments in last hour
  const oneHourAgo = new Date(Date.now() - 3600000);
  const recentComments = await p.dmLog.count({
    where: { createdAt: { gte: oneHourAgo } }
  });
  console.log(`\n=== DM LOGS last hour: ${recentComments} ===`);

  // 4. Check webhook events
  const webhooks = await p.webhookEvent.count({
    where: { createdAt: { gte: oneHourAgo } }
  });
  console.log(`Webhook events last hour: ${webhooks}`);

  await p.$disconnect();
}

main().catch(e => { console.error(e); p.$disconnect(); });