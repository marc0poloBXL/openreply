import { PrismaClient } from './app/generated/prisma/client.js';
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
function decryptToken(encrypted) {
  const secret = process.env.ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error('No encryption key');
  const key = crypto.createHash('sha256').update(secret).digest();
  const parts = encrypted.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const data = Buffer.from(parts[2], 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final('utf8');
}

const p = new PrismaClient();
try {
  const account = await p.instagramAccount.findFirst({ orderBy: { connectedAt: 'desc' } });
  if (!account) { console.log('No account'); process.exit(1); }

  const pageToken = decryptToken(account.pageToken);
  console.log('Token prefix:', pageToken.substring(0, 30) + '...');

  // Check /me
  const r1 = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(pageToken)}`);
  const me = await r1.json();
  console.log('\n=== /me ===');
  console.log(JSON.stringify(me, null, 2));

  if (me.id) {
    // Check /me/accounts (pages managed by this user)
    const r2 = await fetch(`https://graph.facebook.com/v21.0/${me.id}/accounts?fields=id,name,category&access_token=${encodeURIComponent(pageToken)}`);
    const accounts = await r2.json();
    console.log('\n=== /me/accounts ===');
    console.log(JSON.stringify(accounts, null, 2));

    // Try to create a NEW page with Website category
    console.log('\n=== TRYING TO CREATE NEW PAGE ===');
    const r3 = await fetch(`https://graph.facebook.com/v21.0/${me.id}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        name: 'Stoic Zodiac Bot',
        category: 'Website',
        access_token: pageToken,
      }).toString()
    });
    const created = await r3.json();
    console.log(JSON.stringify(created, null, 2));
  }

  // Debug token info
  const r4 = await fetch(
    `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(pageToken)}` +
    `&access_token=${encodeURIComponent('1051360407668084|' + process.env.FACEBOOK_APP_SECRET)}`
  );
  const debug = await r4.json();
  console.log('\n=== Token debug ===');
  console.log(JSON.stringify(debug?.data || debug?.error, null, 2));

} catch(e) { console.error('Error:', e.message); }
await p.$disconnect();