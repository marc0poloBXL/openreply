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
const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://openreply-zeta-ruby.vercel.app";
const IG_ID = "17841438935909153";
const PAGE_ID = "1229304876940609";
const PAGE_ID_OLD = "61594011424463";
const BM_ID = "2052016095704629";
const IG_ACCOUNT_DB_ID = "cmtocgan5000004kzet71p0ka";

import { encryptToken } from "@/lib/meta/oauth";
import { prisma } from "@/lib/db/client";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userToken = url.searchParams.get("token");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // Handle Facebook Login OAuth redirect (code from Facebook)
  if (code) {
    return handleOAuthCode(code, state, req);
  }

  if (!userToken) {
    const explorerUrl = `https://developers.facebook.com/tools/explorer/${APP_ID}/`;

    return new Response(htmlPage("Get Facebook Page Token",
      `<h2>Get a Page Token for @stoiczodiac</h2>

       <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;margin:16px 0;font-size:13px;">
         <strong>⚠️ Facebook Login can't grant <code>pages_manage_metadata</code> for this app.</strong><br>
         The <strong>Graph API Explorer</strong> (developer tool) is the only way — one page, fixed layout:
       </div>

       <ol style="font-size:15px;line-height:1.8;">
         <li><strong>Open</strong> → <a href="${explorerUrl}" target="_blank" style="color:#1877F2;font-weight:600;">Graph API Explorer</a>
           <span style="color:#666;font-size:13px;">(opens pre-configured for our app)</span></li>
         <li><strong>Dropdown</strong> at top: confirm it says <strong>"User Token"</strong></li>
         <li>Click <strong>"Add permissions"</strong> → search for → add <code style="background:#e8e8e8;padding:2px 6px;border-radius:4px;">pages_manage_metadata</code></li>
         <li>Click <strong>"Generate Access Token"</strong> → approve the popup</li>
         <li><strong>Copy</strong> the <code>EAA...</code> token → paste below</li>
       </ol>

       <form method="get" action="" style="text-align:center;margin-top:20px;">
         <input type="text" name="token" placeholder="Paste EAA... token here"
                style="width:90%;padding:12px;border:2px solid #1877F2;border-radius:8px;font-family:monospace;font-size:14px;box-sizing:border-box;">
         <button type="submit" class="btn" style="display:inline-block;margin-top:10px;font-size:16px;padding:12px 28px;">🔍 Get Page Token</button>
       </form>
       <p style="color:#666;font-size:13px;text-align:center;">
         ⚡ The system will exchange the token for 60 days, store it,<br>
         link the IG account to the page, and subscribe webhooks — automatically.
       </p>`
    ), { headers: { "content-type": "text/html" } });
  }

  // If we get here with a userToken, proceed with the existing exchange flow
  return handleTokenPaste(userToken.trim(), req);
}

/**
 * Handle OAuth code from Facebook Login redirect.
 * Exchanges code → short token → long token, then continues with the
 * page-finding and subscribe flow.
 */
async function handleOAuthCode(code: string, state: string | null, req: Request): Promise<Response> {
  try {
    // Exchange code for short-lived access token
    const tokenUrl = new URL(`https://graph.facebook.com/${API_VER}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", APP_ID);
    tokenUrl.searchParams.set("redirect_uri", BASE + "/api/auth/token-helper");
    tokenUrl.searchParams.set("client_secret", APP_SECRET);
    tokenUrl.searchParams.set("code", code);
    const tokenResp = await fetch(tokenUrl.toString());
    const tokenData = await tokenResp.json();
    const shortToken = tokenData.access_token;
    if (!shortToken) {
      return new Response(htmlPage("❌ OAuth Failed",
        `<p class="error">Code exchange failed: ${(tokenData.error?.message || tokenData.error || "unknown").substring(0, 200)}</p>
         <p>This usually means the redirect URI isn't registered in the app. Try the paste-a-token method instead.</p>
         <p><a href="?" style="color:#1877F2;">← Try again</a></p>`
      ), { headers: { "content-type": "text/html" } });
    }

    // Exchange short-lived token for 60-day token
    const longToken = await exchangeForLongToken(shortToken);
    if (!longToken) {
      return new Response(htmlPage("❌ Exchange Failed",
        `<p class="error">Could not extend token lifespan.</p>
         <p><a href="?" style="color:#1877F2;">← Try again</a></p>`
      ), { headers: { "content-type": "text/html" } });
    }

    // Use the same page-finding and subscribe flow as handleTokenPaste
    return processLongToken(longToken, req);
  } catch (e: any) {
    return new Response(htmlPage("❌ Error",
      `<p class="error">${e.message}</p>
       <p><a href="?" style="color:#1877F2;">← Try again</a></p>`
    ), { headers: { "content-type": "text/html" } });
  }
}

/**
 * Exchange a short-lived token for a 60-day long-lived token.
 */
async function exchangeForLongToken(shortToken: string): Promise<string | null> {
  try {
    const exchangeResp = await fetch(
      `https://graph.facebook.com/${API_VER}/oauth/access_token?grant_type=fb_exchange_token` +
      `&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${encodeURIComponent(shortToken)}`
    );
    const exchangeData = await exchangeResp.json();
    return exchangeData.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Process a pasted token: exchange for long-lived, find page, store, link, subscribe.
 */
async function handleTokenPaste(rawToken: string, req: Request): Promise<Response> {
  try {
    // Exchange for 60-day token
    const longLivedToken = await exchangeForLongToken(rawToken.trim());
    if (!longLivedToken) {
      // Try again and capture the actual error
      const exchangeResp = await fetch(
        `https://graph.facebook.com/${API_VER}/oauth/access_token?grant_type=fb_exchange_token` +
        `&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${encodeURIComponent(rawToken.trim())}`
      );
      const exchangeData = await exchangeResp.json();
      return new Response(htmlPage("❌ Exchange Failed",
        `<p class="error">Token exchange failed: ${(exchangeData.error?.message || exchangeData.error || "unknown").substring(0, 200)}</p>
         <p><a href="?" style="color:#1877F2;">← Try again</a></p>`
      ), { headers: { "content-type": "text/html" } });
    }
    return processLongToken(longLivedToken, req);
  } catch (e: any) {
    return new Response(htmlPage("❌ Error",
      `<p class="error">${e.message}</p>
       <p><a href="?" style="color:#1877F2;">← Try again</a></p>`
    ), { headers: { "content-type": "text/html" } });
  }
}

/**
 * Process a 60-day long-lived token: find page, store page token, link IG, subscribe webhooks.
 * Shared by both Facebook Login OAuth and Graph API Explorer paste flows.
 */
async function processLongToken(longLivedToken: string, req: Request): Promise<Response> {
  try {
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
      // Method B: Try via Business Manager
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

    // Method C: Reverse direction — assign page to IG account
    if (!linkResult.includes("success")) {
      try {
        const assignRes = await fetch(
          `https://graph.facebook.com/${API_VER}/${IG_ID}/assigned_pages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: longLivedToken,
              page_id: pageInfo.pageId,
            }),
          }
        );
        const assignData = await assignRes.json();
        if (assignData.success) {
          linkResult += `<p class="success">✅ @stoiczodiac linked via IG assigned_pages!</p>`;
        } else {
          linkResult += `<p class="error">❌ IG assigned_pages failed: ${assignData.error?.message?.slice(0, 150) || "unknown"}</p>`;
        }
      } catch (e3: any) {
        linkResult += `<p class="error">❌ IG assigned_pages threw: ${e3.message}</p>`;
      }
    }

    // Method D: IG assigned_pages with IGAA token on graph.facebook.com
    if (!linkResult.includes("success")) {
      try {
        const stored = await prisma.instagramAccount.findUnique({
          where: { id: IG_ACCOUNT_DB_ID },
          select: { accessToken: true },
        });
        if (stored?.accessToken) {
          const { decryptToken } = await import("@/lib/meta/oauth");
          const igaaToken = decryptToken(stored.accessToken);
          const assignRes = await fetch(
            `https://graph.facebook.com/${API_VER}/${IG_ID}/assigned_pages`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                access_token: igaaToken,
                page_id: pageInfo.pageId,
              }),
            }
          );
          const assignData = await assignRes.json();
          if (assignData.success) {
            linkResult += `<p class="success">✅ @stoiczodiac linked via IG assigned_pages (IGAA on FB graph)!</p>`;
          } else {
            linkResult += `<p class="error">❌ IG assigned_pages (IGAA) failed: ${assignData.error?.message?.slice(0, 150) || "unknown"}</p>`;
          }
        }
      } catch (e4: any) {
        linkResult += `<p class="error">❌ IG assigned_pages (IGAA) threw: ${e4.message}</p>`;
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