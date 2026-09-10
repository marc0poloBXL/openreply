/**
 * Token Helper — Server-Side Only
 *
 * Paste a short-lived token from Graph API Explorer.
 * This page exchanges it for a long-lived token (60 days), finds the
 * connected page, stores the page token in the database, and subscribes
 * webhooks — all in one step.
 * No CORS issues, no OAuth redirects.
 *
 * Page IDs (Stoic Zodiac):
 * - Current (since ~Sep 2026): 1229304876940609
 * - Old (deleted/merged): 61594011424463 (no longer exists)
 */

const APP_ID = "1051360407668084";
const APP_SECRET = "b2708ce0c790783fbf27c0dfcc0e1459";
const API_VER = process.env.META_GRAPH_API_VERSION || "v26.0";
const IG_ID = "17841438935909153";
const PAGE_ID = "1229304876940609";
const PAGE_ID_OLD = "61594011424463";
const BM_ID = "2052016095704629";
const IG_ACCOUNT_DB_ID = "cmtocgan5000004kzet71p0ka";
const CALLBACK_URL = "https://openreply-zeta-ruby.vercel.app/api/webhook";
const VERIFY_TOKEN = "stoiczodiac-webhook-2026";

import { encryptToken } from "@/lib/meta/oauth";
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
    // Step 1: Exchange short-lived Graph API Explorer token for 60-day token
    const exchangeResp = await fetch(
      `https://graph.facebook.com/${API_VER}/oauth/access_token?grant_type=fb_exchange_token` +
      `&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${encodeURIComponent(userToken.trim())}`
    );
    const exchangeData = await exchangeResp.json();
    const longLivedToken = exchangeData.access_token;
    if (!longLivedToken) {
      return new Response(htmlPage("❌ Exchange Failed",
        `<p class="error">Token exchange failed: ${(exchangeData.error?.message || exchangeData.error || "unknown").substring(0, 200)}</p>
         <p><a href="?" style="color:#1877F2;">← Try again</a></p>`
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
      // Diagnostic: check what the token CAN access
      let diag = "<h2>🔍 Token Diagnostics</h2>";
      try {
        const meCheck = await fetch(
          `https://graph.facebook.com/${API_VER}/me?fields=id,name&access_token=${encodeURIComponent(longLivedToken)}`
        );
        const meData = await meCheck.json();
        diag += `<p>✅ Token valid for: ${meData.name} (${meData.id})</p>`;
      } catch { diag += `<p>❌ Token invalid for /me</p>`; }

      try {
        const acctCheck = await fetch(
          `https://graph.facebook.com/${API_VER}/me/accounts?fields=id,name&access_token=${encodeURIComponent(longLivedToken)}`
        );
        const acctData = await acctCheck.json();
        if (acctData.data && acctData.data.length > 0) {
          diag += `<p>✅ /me/accounts returns ${acctData.data.length} pages:</p><ul>`;
          for (const p of acctData.data) {
            diag += `<li>${p.name} (${p.id})</li>`;
          }
          diag += `</ul>`;
        } else {
          diag += `<p>❌ /me/accounts returns 0 pages (missing pages_show_list scope)</p>`;
        }
      } catch { diag += `<p>❌ /me/accounts failed</p>`; }

      try {
        const bmCheck = await fetch(
          `https://graph.facebook.com/${API_VER}/${BM_ID}/owned_pages?fields=id,name&access_token=${encodeURIComponent(longLivedToken)}`
        );
        const bmData = await bmCheck.json();
        if (bmData.data && bmData.data.length > 0) {
          diag += `<p>✅ BM owned_pages returns ${bmData.data.length} pages</p>`;
        } else {
          diag += `<p>❌ BM owned_pages returns 0 (missing business_management scope)</p>`;
        }
      } catch { diag += `<p>❌ BM owned_pages failed</p>`; }

      return new Response(htmlPage("⚠️ Page Not Found",
        `<p class="error">Could not find "Stoic Zodiac" page.</p>
         ${diag}
         <hr>
         <p><strong>Fix:</strong> Go back to the <a href="https://developers.facebook.com/tools/explorer/${APP_ID}/" target="_blank" style="color:#1877F2;">Graph API Explorer</a> and:</p>
         <ol>
           <li>Make sure the dropdown says <strong>"User Token"</strong></li>
           <li>Click the <strong>"Add permissions"</strong> button (top-right of the token box)</li>
           <li>Add: <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>business_management</code>, <code>pages_manage_metadata</code></li>
           <li>Click <strong>"Generate Access Token"</strong> again</li>
           <li><strong>IMPORTANT:</strong> On the Facebook popup, make sure you <strong>check ALL the permission checkboxes</strong> before clicking Continue</li>
           <li>Copy the NEW token and paste it here again</li>
         </ol>
         <p><a href="?" style="color:#1877F2;">← Try again with a fresh token</a></p>`
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
    // The link edge needs pages_manage_metadata. Page tokens sometimes lack
    // this even when the user token has it. Try user token as fallback.
    const linkTokens = [
      { label: "page token", token: pageInfo.pageToken.trim() },
      { label: "user token", token: longLivedToken },
    ];
    for (const { label, token } of linkTokens) {
      try {
        const linkRes = await fetch(
          `https://graph.facebook.com/${API_VER}/${pageInfo.pageId}/instagram_accounts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: token,
              instagram_account_id: IG_ID,
            }),
          }
        );
        const linkData = await linkRes.json();
        if (linkData.success) {
          linkResult = `<p class="success">✅ @stoiczodiac linked to page via ${label}!</p>`;
          break;
        } else {
          linkResult += `<p class="error">❌ ${label} link failed (code ${linkData.error?.code}): ${linkData.error?.message ? linkData.error.message.slice(0, 150) : "unknown"}</p>`;
          if (linkData.error?.error_user_msg) linkResult += `<p style="font-size:13px;color:#666;">${linkData.error.error_user_msg}</p>`;
        }
      } catch (e: any) {
        linkResult += `<p class="error">❌ ${label} link threw: ${e.message}</p>`;
      }
    }

    // If both token types failed on direct link, try BM approach
    if (!linkResult.includes("success")) {
      try {
        const bmRes = await fetch(
          `https://graph.facebook.com/${API_VER}/${BM_ID}/owned_instagram_accounts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: longLivedToken,
              instagram_account_id: IG_ID,
            }),
          }
        );
        const bmData = await bmRes.json();
        if (bmData.success) {
          linkResult += `<p class="success">✅ @stoiczodiac linked via Business Manager!</p>`;
        } else {
          const bmMsg = bmData.error?.message?.slice(0, 150) || "unknown";
          linkResult += `<p class="error">❌ BM link also failed: ${bmMsg}</p>`;
          // If the BM endpoint returned error 33 (doesn't exist), the page
          // may not be in Business Manager at all. Suggest manual action.
          if (bmData.error?.error_subcode === 33) {
            linkResult += `<p style="font-size:13px;color:#666;">💡 The page may not be in Business Manager. Try linking from
              <a href="https://business.facebook.com/" target="_blank" style="color:#1877F2;">Business Settings</a>:
              Add the Instagram account to your Business Manager first.</p>`;
          }
        }
      } catch (e2: any) {
        linkResult += `<p class="error">❌ BM link threw: ${e2.message}</p>`;
      }
    }

    // If still not linked, note it for the user — the token IS stored
    // and webhooks are subscribed. The link can be re-attempted later
    // by visiting /api/auth/token-helper with a fresh Graph API Explorer token.

    // Step 6: Subscribe webhooks — try ALL possible token types
    let subscribed = false;
    let subErrors: string[] = [];

    // Try 1: Page token (might fail if IG not linked to page)
    if (pageInfo?.pageToken) {
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
        if (!subscribed) subErrors.push(`page token: ${igResult.error?.message?.substring(0, 100) || "?"}`);
      } catch { subErrors.push("page token: threw"); }
    }

    // Try 2: User token directly
    if (!subscribed) {
      try {
        const igSub = await fetch(
          `https://graph.facebook.com/${API_VER}/${IG_ID}/subscribed_apps`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: longLivedToken,
              subscribed_fields: "comments,messages",
            }),
          }
        );
        const igResult = await igSub.json();
        subscribed = Boolean(igResult.success || igResult.id);
        if (!subscribed) subErrors.push(`user token: ${igResult.error?.message?.substring(0, 100) || "?"}`);
      } catch { subErrors.push("user token: threw"); }
    }

    // Try 3: App token (app_id|app_secret)
    if (!subscribed) {
      try {
        const appToken = `${APP_ID}|${APP_SECRET}`;
        const igSub = await fetch(
          `https://graph.facebook.com/${API_VER}/${IG_ID}/subscribed_apps`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: appToken,
              subscribed_fields: "comments,messages",
            }),
          }
        );
        const igResult = await igSub.json();
        subscribed = Boolean(igResult.success || igResult.id);
        if (!subscribed) subErrors.push(`app token: ${igResult.error?.message?.substring(0, 100) || "?"}`);
      } catch { subErrors.push("app token: threw"); }
    }

    // Try 4: graph.instagram.com with stored IGAA token (known working path)
	    if (!subscribed) {
	      try {
	        const stored = await prisma.instagramAccount.findUnique({
	          where: { id: IG_ACCOUNT_DB_ID },
	          select: { accessToken: true },
	        });
	        if (stored?.accessToken) {
	          const { decryptToken } = await import("@/lib/meta/oauth");
	          const igaaToken = decryptToken(stored.accessToken);
	          const igSub = await fetch(
	            `https://graph.instagram.com/v25.0/${IG_ID}/subscribed_apps`,
	            {
	              method: "POST",
	              headers: { "Content-Type": "application/json" },
	              body: JSON.stringify({
	                access_token: igaaToken,
	                subscribed_fields: "comments,messages",
	              }),
	            }
	          );
	          const igResult = await igSub.json();
	          subscribed = Boolean(igResult.success || igResult.id);
	          if (!subscribed) subErrors.push(`IGAA on instagram.com: ${igResult.error?.message?.substring(0, 100) || "?"}`);
	        }
	      } catch (e: any) { subErrors.push(`IGAA: ${e.message || "threw"}`); }
	    }
      if (subscribed) {
        await prisma.instagramAccount.update({
          where: { id: IG_ACCOUNT_DB_ID },
          data: { webhookSubscribed: subscribed },
        });
      }

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
  // Prefer exact page ID match first
  for (const p of pages) {
    if (p.id === PAGE_ID) {
      return { pageId: p.id, pageToken: p.access_token, pageName: p.name };
    }
  }
  for (const p of pages) {
    if (p.instagram_business_account?.id === IG_ID) {
      return { pageId: p.id, pageToken: p.access_token, pageName: p.name };
    }
  }
  // Fallback: try old page ID or name match
  for (const p of pages) {
    if (p.id === PAGE_ID_OLD || p.name?.toLowerCase().includes("stoic")) {
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