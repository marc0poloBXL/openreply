const { Client } = require('pg');
const crypto = require('crypto');
const env = require('fs').readFileSync('.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
const encKey = env.match(/ENCRYPTION_KEY=(.+)/)?.[1]?.trim();
const key = Buffer.from(encKey, 'hex');

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  // Check the InstagramAccount table for all tokens
  const r = await client.query('SELECT id, username, instagramId, "pageToken" IS NOT NULL as has_page_token, "accessToken" IS NOT NULL as has_igaa_token, "tokenExpiresAt", "webhookSubscribed" FROM "InstagramAccount"');
  console.log('InstagramAccount:', JSON.stringify(r.rows, null, 2));

  // Check if there's a SystemUser table or any other token storage
  const tables = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
  console.log('\nAll tables:', tables.rows.map(t => t.table_name).join(', '));

  // Check for any Account or Token tables
  for (const table of tables.rows.map(t => t.table_name)) {
    if (table.toLowerCase().includes('account') || table.toLowerCase().includes('token') || table.toLowerCase().includes('user')) {
      try {
        const cols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = '${table}'`);
        console.log(`\n${table} columns:`, cols.rows.map(c => c.column_name).join(', '));
        const data = await client.query(`SELECT * FROM "${table}" LIMIT 3`);
        if (data.rows.length > 0) {
          console.log(`${table} data (1st row keys):`, Object.keys(data.rows[0]).join(', '));
        }
      } catch(e) {}
    }
  }

  // Check Account table specifically
  if (tables.rows.map(t => t.table_name).includes('Account')) {
    const acct = await client.query('SELECT * FROM "Account" LIMIT 5');
    console.log('\nAccount table:', JSON.stringify(acct.rows, null, 2));
  }

  await client.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });