import {Client} from "pg";
import crypto from "crypto";
const c = new Client({connectionString: process.env.DATABASE_URL});
await c.connect();
const r = await c.query('SELECT id, username, "pageToken" IS NOT NULL as has_page, "accessToken" IS NOT NULL as has_igaa, "webhookSubscribed", "tokenExpiresAt" FROM "InstagramAccount"');
console.log(JSON.stringify(r.rows, null, 2));

// Also decrypt both tokens to check expiry
const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
const tok = await c.query('SELECT "pageToken", "accessToken" FROM "InstagramAccount" LIMIT 1');
const row = tok.rows[0];

for (const [name, val] of [["pageToken", row.pageToken], ["accessToken", row.accessToken]]) {
  if (val) {
    const b = Buffer.from(val, "base64");
    const d = crypto.createDecipheriv("aes-256-gcm", key, b.subarray(0, 16));
    d.setAuthTag(b.subarray(16, 32));
    const t = d.update(b.subarray(32)) + d.final("utf8");
    console.log(`\n${name} prefix:`, t.substring(0, 30) + "...");
    console.log(`${name} starts with:`, t.startsWith("EAA") ? "EAA (FB token)" : t.startsWith("IG") ? "IG (IGAA token)" : t.startsWith("EA") ? "EA" : t.substring(0, 6));

    // Test it
    if (t.startsWith("EAA")) {
      const appSecret = process.env.FACEBOOK_APP_SECRET;
      if (!appSecret) { console.error("FACEBOOK_APP_SECRET not set"); process.exit(1); }
      const appToken = `1051360407668084|${appSecret}`;
      const debug = await fetch(`https://graph.facebook.com/v26.0/debug_token?input_token=${encodeURIComponent(t)}&access_token=${appToken}`);
      const dd = await debug.json();
      console.log(`${name} debug:`, JSON.stringify(dd.data?.scopes || dd.error));
    }
  }
}
await c.end();