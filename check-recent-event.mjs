// Quick check of most recent webhook event payload
import { PrismaClient } from './app/generated/prisma/client.js';

const p = new PrismaClient();
try {
  const r = await p.webhookEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
  });
  for (const e of r) {
    console.log(`\n=== Event ${e.id} (${e.createdAt}) ===`);
    console.log('Object:', e.object);
    console.log('Status:', e.status);
    const payload = JSON.stringify(e.payload, null, 2);
    // Truncate if too long
    if (payload.length > 3000) {
      console.log(payload.substring(0, 3000) + '\n... [truncated]');
    } else {
      console.log(payload);
    }
  }
} catch(e) {
  console.error('Error:', e.message);
}
await p.$disconnect();