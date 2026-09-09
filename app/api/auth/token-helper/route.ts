/**
 * Token Helper — Server-Side Only
 *
 * Paste a short-lived token from Graph API Explorer.
 * This page exchanges it for a long-lived token (60 days), finds the
 * connected page, stores the page token in the database, and subscribes
 * webhooks — all in one step.
 * No CORS issues, no OAuth redirects.
 */

const APP_ID = process.env.FACEBOOK_APP_ID || "1051360407668084";
const APP_SECRET = process.env.FACEBOOK_APP_SECRET || "b2708ce0c790783fbf27c0dfcc0e1459";
const API_VER = process.env.META_GRAPH_API_VERSION || "v26.0";
const IG_ID = "17841438935909153";
const PAGE_ID = "61594011424463";
const BM_ID = "2052016095704629";
const IG_ACCOUNT_DB_ID = "cmtocgan5000004kzet71p0ka";
const CALLBACK_URL = "https://openreply-zeta-ruby.vercel.app/api/webhook";
const VERIFY_TOKEN = "stoiczodiac-webhook-2026";

import { encryptToken, exchangeFbLongLivedToken } from "@/lib/meta/oauth";
import { prisma } from "@/lib/db/client";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userToken = url.searchParams.get("token");

  if (!userToken) {
    return new Response(htmlPage("Get Facebook Page Token",
      `<h2>Get a Page Token for @stoiczodiac</h2>
       <p><strong>Step 1:</strong> Go to the Graph API Explorer and get your User Token:</p>
       <p><a href="https://developers.facebook.com/tools/explorer/${APP_ID}/" target="_blank" class="btn-link">https://developers.facebook.com/tools/explorer/${APP_ID}/</a></p>
       <ul>
         <li>Make sure the dropdown says <strong>"User Token"</strong> (not Page Token)</li>
         <li>Add these permissions: <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>business_management</code>, <code>pages_manage_metadata</code></li>
         <li>Click "Generate Access Token" and authorize all the popups</li>
         <li>Click "Add" next to permissions to add them</li>
       </ul>
       <p><strong>Step 2:</strong> Paste the token (EAA...) here:</p>
       <form method="get" action="">
         <input type="text" name="token" placeholder="Paste EAA... token here"
                style="width:100%;padding:10px;border:1px solid #ccc;border-radius:6px;font-family:monospace;font-size:13px;box-sizing:border-box;">
         <button type="submit" class="btn">🔍 Get Page Token</button>
       </form>
       <p style="color:#666;font-size:13px;margin-top:16px;">
         ⚡ The system will exchange your token for a 60-day token and store it automatically.
         You only need to do this when the token expires (every ~2 months).
       </p>`
    ), { headers: { "content-type": "text/html" } });
  }

  try {
    // Step 1: Exchange for long-lived token
    let longLivedToken: string;
    try {
      const result = await exchangeFbLongLivedToken(userToken.trim());
      longLivedToken = result.accessToken;
    } catch (e) {
      return new Response(htmlPage("⚠️ Token Exchange Failed",
        `<p class="error">Could not exchange the token for a long-lived one.</p>
         <p>This usually means the token is already expired or invalid.</p>
         <p>Please go to the <a href="https://developers.facebook.com/tools/explorer/${APP_ID}/" target="_blank" style="color:#1877F2;">Graph API Explorer</a> and generate a fresh token.</p>
         <p><a href="?" style="color:#1877F2;">← Try again with a fresh token</a></p>`
      ), { headers: { "content-type": "text/html" } });
    }

    // Step 2: Try /me/accounts first
    const accountsResp = await fetch(
      `https://graph.facebook.com/${API_VER}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(longLivedToken)}`
    );
    const accountsData = await accountsResp.json();

    let pageInfo: { pageId: string; pageToken: string; pageName: string } | null = null;

    if (accountsData.data && accountsData.data.length > 0) {
      pageInfo = findStoicPage(accountsData.data);
    }

    // Step 3: Try Business Manager if /me/accounts was empty
    if (!pageInfo) {
      const bmResp = await fetch(
        `https://graph.facebook.com/${API_VER}/${BM_ID}/owned_pages?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(longLivedToken)}`
      );
      const bmData = await bmResp.json();
      if (bmData.data && bmData.data.length > 0) {
        pageInfo = findStoicPage(bmData.data);
      }
    }

    if (!pageInfo) {
      return new Response(htmlPage("⚠️ Page Not Found",
        `<p class="error">Could not find "Stoic Zodiac" page. Make sure your token has access to the page.</p>
         <p>Try visiting the <a href="https://developers.facebook.com/tools/explorer/${APP_ID}/" target="_blank" style="color:#1877F2;">Graph API Explorer</a> again, and add <code>business_management</code> permission.</p>
         <p><a href="?" style="color:#1877F2;">← Try again</a></p>`
      ), { headers: { "content-type": "text/html" } });
    }

    // Step 4: Encrypt and store in database
    const encrypted = encryptToken(pageInfo.pageToken.trim());
    const expiresAt = new Date(Date.now() + 55 * 24 * 60 * 60 * 1000);

    await prisma.instagramAccount.update({
      where: { id: IG_ACCOUNT_DB_ID },
      data: { pageToken: encrypted, tokenExpiresAt: expiresAt },
    });

    // Step 5: Try to link @stoiczodiac to the Stoic Zodiac page
    let linkResult = "";
    try {
      const linkRes = await fetch(
        `https://graph.facebook.com/${API_VER}/${pageInfo.pageId}/instagram_accounts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: pageInfo.pageToken.trim(),
            instagram_account_id: IG_ID,
          }),
        }
      );
      const linkData = await linkRes.json();
      if (linkData.success) {
        linkResult = `<p class="success">✅ @stoiczodiac linked to page via API!</p>`;
      } else {
        const e = linkData.error || {};
        linkResult = `<p class="error">❌ API link failed (code ${e.code}): ${e.message ? e.message.slice(0, 150) : "unknown"}</p>`;
        if (e.error_user_msg) linkResult += `<p style="font-size:13px;color:#666;">${e.error_user_msg}</p>`;
      }
    } catch (e: any) {
      linkResult = `<p class="error">❌ Link attempt threw: ${e.message}</p>`;
    }

    // Step 6: Subscribe webhooks
    let subscribed = false;
    try {
      const igSub = await fetch(
        `https://graph.facebook.com/${API_VER}/${IG_ID}/subscribed_apps`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: pageInfo.pageToken,
            subscribed_fields: "comments,messages",
          }),
        }
      );
      const igResult = await igSub.json();
      subscribed = Boolean(igResult.success || igResult.id);
      await prisma.instagramAccount.update({
        where: { id: IG_ACCOUNT_DB_ID },
        data: { webhookSubscribed: subscribed },
      });
    } catch { /* non-critical */ }

    return new Response(htmlPage("✅ Done!",
      `<div class="success">
         <p><strong>✅ Page token stored!</strong> (valid until ~${expiresAt.toLocaleDateString()})</p>
         <p><strong>✅ Page:</strong> ${pageInfo.pageName}</p>
         ${linkResult}
         <p><strong>✅ Webhook:</strong> ${subscribed ? "Subscribed!" : "⚠️ Not subscribed"}</p>
       </div>
       <p>${linkResult.includes("success") ? "Your DM automation is fully configured and can now read comments." : "If the link failed, <strong>refresh this page with a fresh token from Graph API Explorer</strong> making sure you added <code>pages_manage_metadata</code> permission."}</p>
       <p><a href="/api/ig-link" class="btn-link">→ Check link status on /api/ig-link</a></p>
       <hr>
       <p style="font-size:13px;color:#666;">
         The long-lived token will be auto-refreshed by the cron job before it expires.
         You won't need to do this again for ~60 days.
       </p>`
    ), { headers: { "content-type": "text/html" } });

  } catch (e: any) {
    return new Response(htmlPage("❌ Error",
      `<p class="error">${e.message}</p>
       <p><a href="?" style="color:#1877F2;">← Try again</a></p>`
    ), { headers: { "content-type": "text/html" } });
  }
}

export async function POST(req: Request) {
  // Same logic as GET but from form submission
  const formData = await req.formData();
  const userToken = formData.get("token")?.toString().trim() || "";
  const url = new URL(req.url);
  url.searchParams.set("token", userToken);
  return GET(new Request(url.toString()));
}

function findStoicPage(pages: any[]) {
  for (const p of pages) {
    if (p.instagram_business_account?.id === IG_ID || p.id === PAGE_ID || p.name?.toLowerCase().includes("stoic")) {
      return { pageId: p.id, pageToken: p.access_token, pageName: p.name };
    }
  }
  return null;
}

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; line-height: 1.5; }
    h1 { font-size: 1.3em; }
    .error { background: #fee; color: #c00; padding: 12px; border-radius: 6px; }
    .success { background: #e8f5e9; color: #0a8a0a; padding: 12px; border-radius: 6px; }
    pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
    code { font-size: 13px; }
    .btn-link { color:#1877F2; }
    .btn { background:#1877F2;color:white;border:none;padding:10px 20px;border-radius:6px;font-size:14px;cursor:pointer;margin-top:10px; }
    hr { border: none; border-top: 1px solid #eee; }
    input, button { font-size: 14px; }
    ul { padding-left: 20px; }
    li { margin: 8px 0; }
  </style>
</head>
<body>
  <h1>🦁 ${title}</h1>
  ${body}
</body>
</html>`;
}