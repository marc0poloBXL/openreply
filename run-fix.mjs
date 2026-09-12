// run-fix.mjs — Standalone script to change page category and set up comment webhooks
// Runs locally using the Prisma client and project's crypto functions

import { PrismaClient } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash } from 'crypto';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

// Load env from .env.vercel (has all the vars)
config({ path: '.env.vercel' });
config({ path: '.env' });

const DATABASE_URL = process.env.DATABASE_URL;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const IG_APP_ID = "2616058292165458";
const IG_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || "6f741ede5b48248317cc9cecd50a4ab4";
const FB_APP_ID = "1051360407668084";
const FB_APP_SECRET = process.env.FACEBOOK_APP_SECRET || "b2708ce0c790783fbf27c0dfcc0e1459";
const IG_ID = "17841438935909153";
const IG_BIZ_ID = "27851105327914297";
const PAGE_ID = "1229304876940609";
const BM_ID = "2052016095704629";
const CALLBACK_URL = "https://openreply-zeta-ruby.vercel.app/api/webhook";
const VERIFY_TOKEN = "stoiczodiac-webhook-2026";

function encryptToken(token, key) {
  const keyBuf = Buffer.from(key, 'hex');
  const iv = createHash('sha256').update(key).digest().subarray(0, 16);
  const cipher = createCipheriv('aes-256-cbc', keyBuf, iv);
  return Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]).toString('base64');
}

function decryptToken(encrypted, key) {
  const keyBuf = Buffer.from(key, 'hex');
  const iv = createHash('sha256').update(key).digest().subarray(0, 16);
  const decipher = createDecipheriv('aes-256-cbc', keyBuf, iv);
  return decipher.update(Buffer.from(encrypted, 'base64')) + decipher.final('utf8');
}

async function callAPI(method, url, body) {
  const opts = { method, headers: {} };
  if (body) {
    const params = new URLSearchParams(body);
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = params.toString();
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.substring(0, 500) }; }
  return { status: r.status, body: json };
}

async function main() {
  console.log('=== READ TOKENS FROM DB ===');

  if (!DATABASE_URL || !ENCRYPTION_KEY) {
    console.log('DATABASE_URL or ENCRYPTION_KEY not found in env');
    console.log('DATABASE_URL:', DATABASE_URL ? 'found' : 'missing');
    console.log('ENCRYPTION_KEY:', ENCRYPTION_KEY ? 'found' : 'missing');

    // Try direct env reading
    const envContent = readFileSync('.env.vercel', 'utf8');
    const dbMatch = envContent.match(/^DATABASE_URL=(.+)$/m);
    const keyMatch = envContent.match(/^ENCRYPTION_KEY=(.+)$/m);
    console.log('Parsed from file - DATABASE_URL:', dbMatch ? 'found' : 'missing');
    console.log('Parsed from file - ENCRYPTION_KEY:', keyMatch ? 'found' : 'missing');

    // Check if the values are the actual values or [SENSITIVE]
    if (dbMatch) console.log('DB URL starts with:', dbMatch[1].substring(0, 20));
    if (keyMatch) console.log('ENCRYPTION_KEY starts with:', keyMatch[1].substring(0, 10));

    return;
  }

  const prisma = new PrismaClient();

  try {
    const account = await prisma.instagramAccount.findFirst({ orderBy: { connectedAt: 'desc' } });
    if (!account) {
      console.log('No Instagram account found in DB');
      return;
    }

    console.log('Account:', account.id, account.username, account.instagramId);

    let pageToken = null;
    let igaaToken = null;

    if (account.pageToken) {
      pageToken = decryptToken(account.pageToken, ENCRYPTION_KEY);
      console.log('Page token obtained:', pageToken.substring(0, 20) + '...');
    } else {
      console.log('No page token stored');
    }

    if (account.accessToken) {
      igaaToken = decryptToken(account.accessToken, ENCRYPTION_KEY);
      console.log('IGAA token obtained:', igaaToken.substring(0, 20) + '...');
    } else {
      console.log('No IGAA token stored');
    }

    // STEP 1: Check page current category
    console.log('\n=== STEP 1: Check page categories ===');
    if (pageToken) {
      const r = await callAPI('GET', `https://graph.facebook.com/v21.0/${PAGE_ID}/categories?access_token=${encodeURIComponent(pageToken)}`);
      console.log('Categories:', JSON.stringify(r.body, null, 2));

      // STEP 2: Try changing category
      console.log('\n=== STEP 2: Try changing category ===');
      const categoriesToTry = [
        "Website", "Brand", "Product/Service", "Shopping & Retail", "Local Business", "App Page"
      ];

      for (const cat of categoriesToTry) {
        const r = await callAPI('POST', `https://graph.facebook.com/v21.0/${PAGE_ID}`, {
          access_token: pageToken,
          category: cat,
        });
        console.log(`Category ${cat}:`, JSON.stringify(r.body, null, 2));

        if (!r.body.error) {
          console.log(`✅ Category changed to ${cat}!`);

          // Try subscribing
          const sub = await callAPI('POST', `https://graph.facebook.com/v21.0/${PAGE_ID}/subscribed_apps`, {
            access_token: pageToken,
            subscribed_fields: 'comments,messages',
          });
          console.log('Subscribe after category change:', JSON.stringify(sub.body, null, 2));

          // Check IG business account
          const pg = await callAPI('GET', `https://graph.facebook.com/v21.0/${PAGE_ID}?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`);
          console.log('Page after category change:', JSON.stringify(pg.body, null, 2));

          break;
        }
      }
    }

    // STEP 3: Try subscribing IG to FB App with FB app token
    console.log('\n=== STEP 3: Subscribe IG to FB App ===');
    const fbAppToken = `${FB_APP_ID}|${FB_APP_SECRET}`;
    const r1 = await callAPI('POST', `https://graph.facebook.com/v21.0/${IG_ID}/subscribed_apps`, {
      access_token: fbAppToken,
      subscribed_fields: 'comments,messages',
    });
    console.log('Subscribe IG to FB App:', JSON.stringify(r1.body, null, 2));

    // STEP 4: Check FB App subscriptions
    console.log('\n=== STEP 4: Check FB App subscriptions ===');
    const r2 = await callAPI('GET', `https://graph.facebook.com/v21.0/${FB_APP_ID}/subscriptions?access_token=${encodeURIComponent(fbAppToken)}`);
    console.log('FB App subscriptions:', JSON.stringify(r2.body, null, 2));

    // STEP 5: Check IG subscription status via IGAA
    if (igaaToken) {
      console.log('\n=== STEP 5: Check IG subscription via IGAA ===');
      const r3 = await callAPI('GET', `https://graph.instagram.com/v21.0/${IG_ID}/subscribed_apps?access_token=${encodeURIComponent(igaaToken)}`);
      console.log('IG subscriptions:', JSON.stringify(r3.body, null, 2));
    }

    // STEP 6: Try IG App webhook setup with IGAA token
    console.log('\n=== STEP 6: Setup IG App webhook ===');
    const igAppToken = `${IG_APP_ID}|${IG_APP_SECRET}`;
    const r4 = await callAPI('POST', `https://graph.facebook.com/v21.0/${IG_APP_ID}/subscriptions`, {
      object: 'instagram',
      callback_url: CALLBACK_URL,
      verify_token: VERIFY_TOKEN,
      fields: 'comments,messages',
      access_token: igAppToken,
    });
    console.log('IG App webhook setup:', JSON.stringify(r4.body, null, 2));

    // STEP 7: Try to link IG to page using page token and biz ID
    if (pageToken) {
      console.log('\n=== STEP 7: Check page link status ===');
      const r5 = await callAPI('GET', `https://graph.facebook.com/v21.0/${PAGE_ID}?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`);
      console.log('Page link status:', JSON.stringify(r5.body, null, 2));
    }

    console.log('\n=== DONE ===');

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => console.error(e.message));