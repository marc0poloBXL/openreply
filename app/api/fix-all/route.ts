/**
 * Fix-All Route — Server-side only.
 * Does everything needed to get comment auto-reply working:
 * 1. Read + decrypt both tokens from DB
 * 2. Check IG account type
 * 3. Check subscription status
 * 4. Try to set up Instagram App webhook
 * 5. Try to subscribe IG to Facebook App
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";

const IG_ID = "17841438935909153";
const IG_BIZ_ID = "27851105327914297";
const PAGE_ID = "1229304876940609";
const FB_APP_ID = "1051360407668084";
const FB_APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";
const IG_APP_ID = process.env.INSTAGRAM_APP_ID || "2616058292165458";
const IG_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || "6f741ede9465e7fc28b8e601daf8dc92";
const CALLBACK_URL = "https://openreply-zeta-ruby.vercel.app/api/webhook";
const VERIFY_TOKEN = "stoiczodiac-webhook-2026";

async function fetchGraph(url: string, body?: Record<string, string>) {
  const opts: RequestInit = { method: body ? "POST" : "GET", headers: {} };
  if (body) {
    opts.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    opts.body = new URLSearchParams(body).toString();
  }
  const r = await fetch(url, opts);
  return { status: r.status, body: await r.json() };
}

export async function GET() {
  const results: Record<string, unknown> = {};
  const errors: string[] = [];

  // 1. Read tokens
  const account = await prisma.instagramAccount.findFirst({ orderBy: { connectedAt: "desc" } });
  if (!account) {
    return NextResponse.json({ error: "No Instagram account found" }, { status: 404 });
  }

  results.account = { id: account.id, username: account.username, instagramId: account.instagramId };
  let igaaToken: string | null = null;
  let pageToken: string | null = null;

  try {
    if (account.accessToken) igaaToken = decryptToken(account.accessToken);
    if (account.pageToken) pageToken = decryptToken(account.pageToken);
  } catch (e: any) {
    errors.push(`decrypt: ${e.message}`);
  }

  results.hasIgaaToken = Boolean(igaaToken);
  results.hasPageToken = Boolean(pageToken);

  // 2. Check IG account type via graph.instagram.com (IGAA token)
  if (igaaToken) {
    try {
      const r = await fetchGraph(
        `https://graph.instagram.com/v21.0/${IG_ID}?fields=id,username,account_type,profile_picture_url&access_token=${encodeURIComponent(igaaToken)}`
      );
      results.igAccountType = r.body;
    } catch (e: any) {
      errors.push(`ig_type: ${e.message}`);
    }

    // Check subscription status
    try {
      const r = await fetchGraph(
        `https://graph.instagram.com/v21.0/${IG_ID}/subscribed_apps?access_token=${encodeURIComponent(igaaToken)}`
      );
      results.igSubscriptionViaIGAA = r.body;
    } catch (e: any) {
      errors.push(`ig_sub: ${e.message}`);
    }
  }

  // 3. Try to set up Instagram App webhook callback with app token
  const igAppToken = `${IG_APP_ID}|${IG_APP_SECRET}`;
  try {
    const r = await fetchGraph(
      `https://graph.facebook.com/v26.0/${IG_APP_ID}/subscriptions`,
      {
        object: "instagram",
        callback_url: CALLBACK_URL,
        verify_token: VERIFY_TOKEN,
        fields: "comments,messages",
        access_token: igAppToken,
      }
    );
    results.igAppWebhookSetup = r.body;
  } catch (e: any) {
    errors.push(`ig_webhook_setup: ${e.message}`);
  }

  // 4. Check IG App current subscriptions
  try {
    const r = await fetchGraph(
      `https://graph.facebook.com/v26.0/${IG_APP_ID}/subscriptions?access_token=${encodeURIComponent(igAppToken)}`
    );
    results.igAppSubscriptions = r.body;
  } catch (e: any) {
    errors.push(`ig_app_subs: ${e.message}`);
  }

  // 5. Subscribe IG to FB App via FB app token
  const fbAppToken = `${FB_APP_ID}|${FB_APP_SECRET}`;
  try {
    const r = await fetchGraph(
      `https://graph.facebook.com/v26.0/${IG_ID}/subscribed_apps`,
      {
        access_token: fbAppToken,
        subscribed_fields: "comments,messages",
      }
    );
    results.subscribeIGtoFBApp = r.body;
  } catch (e: any) {
    errors.push(`sub_ig_fb: ${e.message}`);
  }

  // 6. Check FB App subscriptions
  try {
    const r = await fetchGraph(
      `https://graph.facebook.com/v26.0/${FB_APP_ID}/subscriptions?access_token=${encodeURIComponent(fbAppToken)}`
    );
    results.fbAppSubscriptions = r.body;
  } catch (e: any) {
    errors.push(`fb_app_subs: ${e.message}`);
  }

  // 7. Try to get page instagram_business_account (link check)
  if (pageToken) {
    try {
      const r = await fetchGraph(
        `https://graph.facebook.com/v26.0/${PAGE_ID}?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`
      );
      results.pageLinkStatus = r.body;
    } catch (e: any) {
      errors.push(`page_link: ${e.message}`);
    }
  }

  // 8. Try to subscribe via user token approach — get a page token and use it
  if (pageToken) {
    try {
      const r = await fetchGraph(
        `https://graph.facebook.com/v26.0/${IG_ID}/subscribed_apps`,
        {
          access_token: pageToken,
          subscribed_fields: "comments,messages",
        }
      );
      results.subscribeViaPageToken = r.body;
    } catch (e: any) {
      errors.push(`sub_page: ${e.message}`);
    }
  }

  // 9. Try graph.instagram.com subscribed_apps (for completeness)
  if (igaaToken) {
    try {
      const r = await fetchGraph(
        `https://graph.instagram.com/v21.0/${IG_ID}/subscribed_apps`,
        {
          access_token: igaaToken,
          subscribed_fields: "comments,messages",
        }
      );
      results.subscribeViaIGAA = r.body;
    } catch (e: any) {
      errors.push(`sub_igaa: ${e.message}`);
    }
  }

  // 10. Try linking the page with the correct Business Account ID
  if (pageToken) {
    try {
      const r = await fetchGraph(
        `https://graph.facebook.com/v26.0/${PAGE_ID}/instagram_accounts`,
        {
          access_token: pageToken,
          instagram_account_id: IG_BIZ_ID,
        }
      );
      results.linkWithBizID = r.body;
    } catch (e: any) {
      errors.push(`link_biz: ${e.message}`);
    }
  }

  // 11. Try linking with user token (in case page token doesn't have full scope)
  // We need the user token for this. Let's try with the FB app token instead.
  try {
    const r = await fetchGraph(
      `https://graph.facebook.com/v26.0/${PAGE_ID}/instagram_accounts`,
      {
        access_token: `${FB_APP_ID}|${FB_APP_SECRET}`,
        instagram_account_id: IG_BIZ_ID,
      }
    );
    results.linkWithAppToken = r.body;
  } catch (e: any) {
    errors.push(`link_app: ${e.message}`);
  }

  // 12. Check page after potential link
  if (pageToken) {
    try {
      const r = await fetchGraph(
        `https://graph.facebook.com/v26.0/${PAGE_ID}?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`
      );
      results.pageAfterLink = r.body;
    } catch (e: any) {
      errors.push(`page_sfter: ${e.message}`);
    }
  }

  // 13. Subscribe using Business Account ID + FB app token (this is the correct ID for graph.facebook.com)
  try {
    const r = await fetchGraph(
      `https://graph.facebook.com/v26.0/${IG_BIZ_ID}/subscribed_apps`,
      {
        access_token: fbAppToken,
        subscribed_fields: "comments,messages",
      }
    );
    results.subscribeBizFBApp = r.body;
  } catch (e: any) {
    errors.push(`sub_biz_fb: ${e.message}`);
  }

  // 14. Subscribe using Business Account ID + page token
  if (pageToken) {
    try {
      const r = await fetchGraph(
        `https://graph.facebook.com/v26.0/${IG_BIZ_ID}/subscribed_apps`,
        {
          access_token: pageToken,
          subscribed_fields: "comments,messages",
        }
      );
      results.subscribeBizPage = r.body;
    } catch (e: any) {
      errors.push(`sub_biz_page: ${e.message}`);
    }
  }

  // 15. Check if IG App already has webhook subscriptions
  // The FB App (1051360407668084) already has the webhook callback.
  // If the IG account subscribes to FB App, events go to FB App's callback.
  // But if it subscribed via IGAA token, events go to Instagram App (2616058292165458).
  // Let's check what the Instagram App's subscriptions look like.
  try {
    const r = await fetchGraph(
      `https://graph.facebook.com/v26.0/${FB_APP_ID}/subscriptions?access_token=${encodeURIComponent(fbAppToken)}`
    );
    results.fbAppSubscriptionsFinal = r.body;
  } catch (e: any) {
    errors.push(`fb_subs_final: ${e.message}`);
  }

  results.errors = errors;

  return NextResponse.json(results);
}