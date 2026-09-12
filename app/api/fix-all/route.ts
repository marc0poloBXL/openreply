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
const IG_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || "6f741ede5b48248317cc9cecd50a4ab4";
const CALLBACK_URL = "https://openreply-zeta-ruby.vercel.app/api/webhook";
const VERIFY_TOKEN = "stoiczodiac-webhook-2026";
const BM_ID = "2052016095704629";
const SYSTEM_USER_ID = "61594008092430";

async function fetchGraph(url: string, body?: Record<string, string>) {
  const opts: RequestInit = { method: body ? "POST" : "GET", headers: {} };
  if (body) {
    opts.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    opts.body = new URLSearchParams(body).toString();
  }
  const r = await fetch(url, opts);
  return { status: r.status, body: await r.json() };
}

export async function GET(req: Request) {
  const results: Record<string, unknown> = {};
  const errors: string[] = [];
  const url = new URL(req.url);
  const newPageToken = url.searchParams.get("page_token");
  const newUserToken = url.searchParams.get("user_token");

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

  // If new tokens provided, store them
  if (newPageToken) {
    try {
      const { encryptToken } = await import("@/lib/meta/oauth");
      const encrypted = encryptToken(newPageToken.trim());
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: { pageToken: encrypted, tokenExpiresAt: new Date(Date.now() + 55 * 24 * 60 * 60 * 1000) },
      });
      pageToken = newPageToken;
      results.hasPageToken = true;
      results.newPageTokenStored = true;
    } catch (e: any) {
      errors.push(`store_page_token: ${e.message}`);
    }
  }

  if (newUserToken) {
    try {
      const { encryptToken } = await import("@/lib/meta/oauth");
      const encrypted = encryptToken(newUserToken.trim());
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: { accessToken: encrypted, tokenExpiresAt: new Date(Date.now() + 55 * 24 * 60 * 60 * 1000) },
      });
      results.newUserTokenStored = true;
    } catch (e: any) {
      errors.push(`store_user_token: ${e.message}`);
    }
  }

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

  // 8. Try to subscribe via page-id/subscribed_apps (correct approach per Meta docs)
  if (pageToken) {
    try {
      const r = await fetchGraph(
        `https://graph.facebook.com/v25.0/${PAGE_ID}/subscribed_apps`,
        {
          access_token: pageToken,
          subscribed_fields: "comments,messages",
        }
      );
      results.subscribeViaPageId = r.body;
    } catch (e: any) {
      errors.push(`sub_page_id: ${e.message}`);
    }

    // Also try page-id/subscribed_apps with just "comments" field
    try {
      const r = await fetchGraph(
        `https://graph.facebook.com/v25.0/${PAGE_ID}/subscribed_apps`,
        {
          access_token: pageToken,
          subscribed_fields: "comments",
        }
      );
      results.subscribeViaPageIdCommentsOnly = r.body;
    } catch (e: any) {
      errors.push(`sub_page_id_comm: ${e.message}`);
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

  // 10. Try linking the page with the page token (has pages_manage_metadata confirmed)
  if (pageToken) {
    // Try with IG_BIZ_ID (graph.facebook.com identifier)
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

    // Try with IG_ID (graph.instagram.com identifier)
    try {
      const r = await fetchGraph(
        `https://graph.facebook.com/v26.0/${PAGE_ID}/instagram_accounts`,
        {
          access_token: pageToken,
          instagram_account_id: IG_ID,
        }
      );
      results.linkWithIGID = r.body;
    } catch (e: any) {
      errors.push(`link_igid: ${e.message}`);
    }

    // Try assigned_pages (reverse direction)
    try {
      const r = await fetchGraph(
        `https://graph.facebook.com/v26.0/${IG_BIZ_ID}/assigned_pages`,
        {
          access_token: pageToken,
          page_id: PAGE_ID,
        }
      );
      results.assignPageViaBiz = r.body;
    } catch (e: any) {
      errors.push(`assign_biz: ${e.message}`);
    }

    // Try assigned_pages with IG_ID
    try {
      const r = await fetchGraph(
        `https://graph.facebook.com/v26.0/${IG_ID}/assigned_pages`,
        {
          access_token: pageToken,
          page_id: PAGE_ID,
        }
      );
      results.assignPageViaIG = r.body;
    } catch (e: any) {
      errors.push(`assign_ig: ${e.message}`);
    }
  }

  // 10b. Try link with user token if we have one (from query param)
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

  // 15. Try setting IG App callback URL using IGAA token (it's an IG App user token)
  if (igaaToken) {
    try {
      const r = await fetchGraph(
        `https://graph.facebook.com/v26.0/${IG_APP_ID}/subscriptions`,
        {
          access_token: igaaToken,
          object: "instagram",
          callback_url: CALLBACK_URL,
          verify_token: VERIFY_TOKEN,
          fields: "comments,messages",
        }
      );
      results.igAppSetupViaIGAA = r.body;
    } catch (e: any) {
      errors.push(`ig_app_igaa: ${e.message}`);
    }
  }

  // 16. Try exchanging IGAA token for FB token (cross-app exchange)
  if (igaaToken) {
    try {
      // Try using IGAA token on FB App's exchange endpoint
      const r = await fetchGraph(
        `https://graph.facebook.com/v26.0/oauth/access_token?grant_type=fb_exchange_token` +
        `&client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&fb_exchange_token=${encodeURIComponent(igaaToken)}`
      );
      results.igaaToFBExchange = r.body;
      // If we got a token back, try to use it
      const crossToken = (r.body as any).access_token;
      if (crossToken) {
        results.igaaCrossTokenPrefix = crossToken.substring(0, 20) + '...';
        // Try subscribing IG with this cross-token
        const sub = await fetchGraph(
          `https://graph.facebook.com/v26.0/${IG_ID}/subscribed_apps`,
          { access_token: crossToken, subscribed_fields: "comments,messages" }
        );
        results.igaaCrossSubscribe = sub.body;
        // Try linking with this cross-token
        const link = await fetchGraph(
          `https://graph.facebook.com/v26.0/${PAGE_ID}/instagram_accounts`,
          { access_token: crossToken, instagram_account_id: IG_BIZ_ID }
        );
        results.igaaCrossLink = link.body;
      }
    } catch (e: any) {
      errors.push(`igaa_xchg: ${e.message}`);
    }
  }

  // 17. Check FB App subscriptions final
  try {
    const r = await fetchGraph(
      `https://graph.facebook.com/v26.0/${FB_APP_ID}/subscriptions?access_token=${encodeURIComponent(fbAppToken)}`
    );
    results.fbAppSubscriptionsFinal = r.body;
  } catch (e: any) {
    errors.push(`fb_subs_final: ${e.message}`);
  }

  // 18. Try to add FB App to Business Portfolio via API (using user token with business_management)
  const businessToken = url.searchParams.get("business_token") || url.searchParams.get("user_token") || newUserToken;
  // 18. FIX: Try to change page category from "Personal blog" to business-compatible
  if (pageToken) {
    // First, check current page categories
    try {
      const r = await fetchGraph(
        `https://graph.facebook.com/v21.0/${PAGE_ID}/categories?access_token=${encodeURIComponent(pageToken)}`
      );
      results.pageCategories = r.body;
    } catch (e: any) {
      errors.push(`get_cats: ${e.message}`);
    }

    // Try changing category to Website (common business category)
    // Various category names to try
    const categoriesToTry = [
      "Website",
      "Brand",
      "Product/Service",
      "Shopping & Retail",
      "Local Business",
      "App Page",
    ];
    results.categoryChangeAttempts = [];

    for (const cat of categoriesToTry) {
      try {
        const r = await fetchGraph(
          `https://graph.facebook.com/v21.0/${PAGE_ID}`,
          {
            access_token: pageToken,
            category: cat,
          }
        );
        (results.categoryChangeAttempts as Array<{category: string; result: unknown}>).push({ category: cat, result: r.body });
        // If successful, try subscribing comments now
        if (!(r.body as any).error) {
          results.categoryChangedTo = cat;
          // Try page-id/subscribed_apps
          const sub = await fetchGraph(
            `https://graph.facebook.com/v21.0/${PAGE_ID}/subscribed_apps`,
            { access_token: pageToken, subscribed_fields: "comments,messages" }
          );
          results.subscribeAfterCategoryChange = sub.body;

          // Try IG biz ID subscription
          const sub2 = await fetchGraph(
            `https://graph.facebook.com/v21.0/${IG_BIZ_ID}/subscribed_apps`,
            { access_token: fbAppToken, subscribed_fields: "comments,messages" }
          );
          results.subscribeIGAfterCategoryChange = sub2.body;

          // Check page instagram_business_account
          const pg = await fetchGraph(
            `https://graph.facebook.com/v21.0/${PAGE_ID}?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`
          );
          results.pageAfterCategoryChange = pg.body;

          break; // Stop trying more categories
        }
      } catch (e: any) {
        errors.push(`cat_change_${cat}: ${e.message}`);
      }
    }

    // If all categories failed, try using category_id = 0 (generic business)
    if (!results.categoryChangedTo) {
      try {
        const r = await fetchGraph(
          `https://graph.facebook.com/v21.0/${PAGE_ID}`,
          {
            access_token: pageToken,
            category_id: "0",
          }
        );
        results.categoryChangeZeroId = r.body;
      } catch (e: any) {
        errors.push(`cat_zero: ${e.message}`);
      }
    }

    // Final attempt: try subscribing via IGAA token on graph.instagram.com
    // This already works - but check the IG App webhook status
    if (igaaToken) {
      try {
        // Check if there's any subscription on the IG account (it exists)
        const subs = await fetchGraph(
          `https://graph.instagram.com/v21.0/${IG_ID}/subscribed_apps?access_token=${encodeURIComponent(igaaToken)}`
        );
        results.igSubscriptions = subs.body;
      } catch (e: any) {
        errors.push(`ig_subs_final: ${e.message}`);
      }
    }
  }

  // 19. Check WebhookEvent table for comment events
  try {
    const events = await prisma.webhookEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, object: true, status: true, createdAt: true },
    });
    results.recentWebhookEvents = events;
    const totalEvents = await prisma.webhookEvent.count();
    results.totalWebhookEvents = totalEvents;

    // Get full payload of most recent event to check for comment test data
    const rawEvent = await prisma.webhookEvent.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true, object: true, payload: true, createdAt: true },
    });
    if (rawEvent) {
      const p = rawEvent.payload as Record<string, unknown>;
      const entries = Array.isArray(p?.entry) ? (p.entry as Record<string, unknown>[]) : [];
      results.latestWebhookPayload = {
        id: rawEvent.id,
        createdAt: rawEvent.createdAt,
        object: rawEvent.object,
        entryCount: entries.length,
        hasCommentChange: entries.some((e: any) =>
          Array.isArray(e.changes) && e.changes.some((c: any) => c.field === "comments")
        ),
        hasMessaging: entries.some((e: any) => Array.isArray(e.messaging)),
        messagingCount: entries.reduce((sum: number, e: any) => sum + (Array.isArray(e.messaging) ? e.messaging.length : 0), 0),
      };
    }
  } catch (e: any) {
    errors.push(`webhook_events: ${e.message}`);
  }

  // 20. Try to read IG media via IGAA token, then post a test comment
  if (igaaToken) {
    try {
      const r = await fetchGraph(
        `https://graph.instagram.com/v21.0/${IG_ID}/media?fields=id,caption,media_type,timestamp,comments_count&limit=5&access_token=${encodeURIComponent(igaaToken)}`
      );
      results.recentMedia = r.body;
      if ((r.body as any)?.data) {
        const firstPost = (r.body as any).data[0];
        if (firstPost?.id && firstPost.comments_count > 0) {
          const comments = await fetchGraph(
            `https://graph.instagram.com/v21.0/${firstPost.id}/comments?fields=id,text,timestamp,username&access_token=${encodeURIComponent(igaaToken)}`
          );
          results.sampleComments = comments.body;
        }

        // Record which post we'd comment on for reference
        const testMediaId = (r.body as any).data[0]?.id;
        results.firstPostId = testMediaId;
      }
    } catch (e: any) {
      errors.push(`media_check: ${e.message}`);
    }
  }

  results.errors = errors;

  return NextResponse.json(results);
}