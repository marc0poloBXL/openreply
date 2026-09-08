import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import {
  decryptToken,
  encryptToken,
  exchangeFbCodeForToken,
  exchangeFbLongLivedToken,
  createOAuthState,
  verifyOAuthState,
} from "@/lib/meta/oauth";

const APP_ID = process.env.FACEBOOK_APP_ID || "1051360407668084";
const IG_ID = "17841438935909153";

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 20px; line-height: 1.5; }
    h1 { font-size: 22px; }
    .card { background: #f5f5f5; padding: 20px; border-radius: 12px; margin: 20px 0; }
    .card p { margin: 6px 0; }
    .success { color: #16a34a; font-weight: bold; }
    .error { color: #dc2626; }
    .btn { display:inline-block; background:#1877f2; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-size:16px; font-weight:500; }
    .btn:hover { background:#166fe5; }
    ol li { margin-bottom: 8px; }
    code { background: #e8e8e8; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    pre { background: #1e1e1e; color: #e0e0e0; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Link @stoiczodiac to Facebook</h1>
  ${body}
</body>
</html>`;
}

/**
 * GET /api/ig-link
 *
 * Three modes via query param:
 *   1. ?action=auth         → Start Facebook OAuth
 *   2. ?code=...&state=...  → OAuth callback (handle the code exchange)
 *   3. (no params)          → Show status page
 */
export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl();
  const action = request.nextUrl.searchParams.get("action");
  const code = request.nextUrl.searchParams.get("code");
  const stateParam = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const message = request.nextUrl.searchParams.get("message");

  // ── Mode: OAuth callback ──────────────────────────────────────────────────
  if (code || error) {
    return handleCallback(baseUrl, code, error, stateParam);
  }

  // ── Mode: Start OAuth ─────────────────────────────────────────────────────
  if (action === "auth") {
    // Use the ALREADY-REGISTERED callback URI so Facebook doesn't block it
    const redirectUri = `${baseUrl}/api/instagram/callback/facebook`;
    const state = createOAuthState("ig-link-standalone");
    const params = new URLSearchParams({
      client_id: APP_ID,
      redirect_uri: redirectUri,
      scope: "pages_show_list,pages_read_engagement",
      response_type: "code",
      state,
    });
    return NextResponse.redirect(
      `https://www.facebook.com/dialog/oauth?${params.toString()}`
    );
  }

  // ── Mode: Status page ────────────────────────────────────────────────────
  let statusHtml = "";
  let isLinked = false;

  try {
    const account = await prisma.instagramAccount.findFirst({
      orderBy: { connectedAt: "desc" },
    });
    const token = account?.pageToken ? decryptToken(account.pageToken) : null;
    if (token) {
      const res = await fetch(
        `https://graph.facebook.com/v26.0/1229304876940609?fields=name,instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`
      );
      const data = (await res.json()) as Record<string, unknown>;
      if (data.instagram_business_account) {
        isLinked = true;
        const ig = data.instagram_business_account as Record<string, unknown>;
        statusHtml = `<div class="card"><p class="success">✅ Linked! IG: @${ig.username}</p></div>`;
      } else {
        statusHtml = `<div class="card"><p class="error">❌ @stoiczodiac NOT linked to "Stoic Zodiac"</p></div>`;
      }
    } else {
      statusHtml = `<div class="card"><p class="error">❌ No page token stored</p></div>`;
    }
  } catch {
    statusHtml = `<div class="card"><p class="error">❌ Could not check link status</p></div>`;
  }

  // Show a success message if redirected back from callback
  const messageHtml = message
    ? `<div class="card"><p>${message}</p></div>`
    : "";

  if (isLinked) {
    return new Response(
      htmlPage(
        "Already Linked",
        `${statusHtml}${messageHtml}<p>Comment reading is working. No action needed.</p>`
      ),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  return new Response(
    htmlPage(
      "Link Instagram to Page",
      `
      ${statusHtml}
      ${messageHtml}

      <div class="card">
        <p>Click below to authorize via Facebook Login. This will:</p>
        <ol>
          <li>Get a Facebook User Token for your account</li>
          <li>List pages you manage, find "Stoic Zodiac"</li>
          <li>Try to link @stoiczodiac to it</li>
          <li>Store the new token automatically</li>
        </ol>
        <p style="margin-top:16px;">
          <a href="${baseUrl}/api/ig-link?action=auth" class="btn">Continue with Facebook</a>
        </p>
      </div>

      <div class="card" style="font-size:13px;color:#555;">
        App: stoiczodiac-dm (${APP_ID}) ·
        IG: @stoiczodiac (${IG_ID}) ·
        Page: Stoic Zodiac (1229304876940609)
      </div>
    `
    ),
    { headers: { "Content-Type": "text/html" } }
  );
}

/**
 * Handle the OAuth callback — exchange code for token, find page, try linking,
 * store token.
 */
async function handleCallback(
  baseUrl: string,
  code: string | null,
  error: string | null,
  stateParam: string | null
): Promise<Response> {
  if (error) {
    return new Response(
      htmlPage(
        "Authorization Denied",
        `<div class="card"><p class="error">❌ Facebook authorization was denied.</p></div>
         <p><a href="${baseUrl}/api/ig-link">← Try again</a></p>`
      ),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code || !verifyOAuthState(stateParam)) {
    return new Response(
      htmlPage(
        "Invalid Callback",
        `<div class="card"><p class="error">❌ Invalid OAuth callback (missing code or invalid state).</p></div>
         <p><a href="${baseUrl}/api/ig-link">← Try again</a></p>`
      ),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  try {
    const redirectUri = `${baseUrl}/api/ig-link`;

    // Step 1: Exchange code for short-lived FB user token
    const { accessToken: shortLivedToken } = await exchangeFbCodeForToken(
      code,
      redirectUri
    );

    // Step 2: Exchange for long-lived token (60 days)
    const { accessToken: longLivedToken } =
      await exchangeFbLongLivedToken(shortLivedToken);

    // Step 3: List user's pages
    const version = process.env.META_GRAPH_API_VERSION ?? "v26.0";
    const accountsUrl = new URL(
      `https://graph.facebook.com/${version}/me/accounts`
    );
    accountsUrl.searchParams.set(
      "fields",
      "id,name,access_token,instagram_business_account{id,username,name}"
    );
    accountsUrl.searchParams.set("access_token", longLivedToken);
    const accountsResp = await fetch(accountsUrl.toString());
    const accountsData = (await accountsResp.json()) as {
      data?: Array<{
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: {
          id: string;
          username: string;
          name: string;
        };
      }>;
    };

    if (!accountsData.data || accountsData.data.length === 0) {
      throw new Error("No Facebook pages found for this user");
    }

    // Try to find the Stoic Zodiac page by our known ID
    const targetPage = accountsData.data.find(
      (p) => p.id === "1229304876940609"
    );
    const fallbackPage = accountsData.data[0];

    if (!targetPage) {
      // Page 1229304876940609 not in user's managed pages
      return new Response(
        htmlPage(
          "Page Not Found",
          `<div class="card"><p class="error">❌ "Stoic Zodiac" page (ID 1229304876940609) is not in your managed pages.</p>
           <p>You may be logged into the wrong Facebook account, or the page was created under a different Business Manager.</p>
           <p><a href="${baseUrl}/api/ig-link">← Try again</a></p></div>`
        ),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const pageId = targetPage.id;
    const pageToken = targetPage.access_token;
    const igBiz = targetPage.instagram_business_account;
    let linkResult = "";

    if (igBiz && igBiz.id === IG_ID) {
      // Already linked!
      linkResult = `<p class="success">✅ @stoiczodiac is already linked to this page!</p>`;
    } else if (igBiz && igBiz.id !== IG_ID) {
      // Linked to a DIFFERENT IG account
      linkResult = `<p class="error">⚠️ This page is linked to @${igBiz.username} (${igBiz.id}), not @stoiczodiac.</p>`;
    } else {
      // No IG linked — try to link it
      linkResult = `<p>⏳ No IG linked yet. Attempting to link via API...</p>`;
      try {
        const linkRes = await fetch(
          `https://graph.facebook.com/v26.0/${pageId}/instagram_accounts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: pageToken,
              instagram_account_id: IG_ID,
            }),
          }
        );
        const linkData = await linkRes.json();
        if (linkData.success) {
          linkResult +=
            `<p class="success">✅ Linked via API! @stoiczodiac is now connected to "Stoic Zodiac".</p>`;
        } else {
          linkResult +=
            `<p class="error">❌ API linking failed (${linkData.error?.code || "unknown"}): ${linkData.error?.message || "unknown error"}</p>` +
            `<p>Try manually: In the Instagram app → Settings → Account Center → Linked Accounts → Facebook → connect "Stoic Zodiac".</p>`;
        }
      } catch (e) {
        linkResult +=
          `<p class="error">❌ API linking threw: ${e instanceof Error ? e.message : e}</p>`;
      }
    }

    // Step 4: Store the page token
    const encryptedPageToken = encryptToken(pageToken);
    const tokenExpiresAt = new Date(
      Date.now() + 60 * 24 * 60 * 60 * 1000
    );

    const account = await prisma.instagramAccount.findFirst({
      orderBy: { connectedAt: "desc" },
    });
    if (account) {
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: { pageToken: encryptedPageToken, tokenExpiresAt },
      });
      linkResult += `<p>✅ Page token stored in database (expires ~${tokenExpiresAt.toLocaleDateString()}).</p>`;
    } else {
      linkResult += `<p>⚠️ No InstagramAccount found in DB — token NOT stored.</p>`;
    }

    return new Response(
      htmlPage(
        "Result",
        `<div class="card">${linkResult}</div>
         <p><a href="${baseUrl}/api/ig-link" class="btn">← Back to status page</a></p>`
      ),
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      htmlPage(
        "Error",
        `<div class="card"><p class="error">❌ ${message}</p></div>
         <p><a href="${baseUrl}/api/ig-link">← Try again</a></p>`
      ),
      { headers: { "Content-Type": "text/html" } }
    );
  }
}