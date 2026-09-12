// check-events.mjs — Check webhook events via the API health endpoint
import('./app/generated/prisma/client.js').then(async ({ PrismaClient }) => {
  try {
    const prisma = new PrismaClient();

    // Check if WebhookEvent table exists
    const tables = await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    console.log('Tables:', tables.map(t => t.table_name).join(', '));

    // Check WebhookEvent
    if (tables.find(t => t.table_name === 'WebhookEvent')) {
      const count = await prisma.webhookEvent.count();
      console.log('\nWebhookEvent count:', count);
      const recent = await prisma.webhookEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 5 });
      console.log('Recent events:', JSON.stringify(recent, null, 2));
    }

    // Check DmLog
    if (tables.find(t => t.table_name === 'DmLog')) {
      const count = await prisma.dmLog.count();
      console.log('\nDmLog count:', count);
    }
  } catch(e) {
    console.error('Error:', e.message);
  }
}).catch(e => console.error('Import error:', e.message));