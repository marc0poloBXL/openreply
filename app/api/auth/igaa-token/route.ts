/**
 * IGAA Token Helper — Server-Side Only
 *
 * One-click Instagram Business Login OAuth flow.
 * Click "Connect Instagram" → authorize → token stored automatically.
 * No hunting for tokens, no developer dashboards.
 *
 * As a fallback, you can also paste a token directly (IGAA...) from the
 * Graph API Explorer.
 */

const APP_ID = process.env.INSTAGRAM_APP_ID || "2616058292165458";
const APP_SECRET =
  process.env.INSTAGRAM_APP_SECRET || "6f741ede5b48248317cc9cecd50a4ab4";
const API_VER = process.env.META_GRAPH_API_VERSION || "v26.0";
const IG_ACCOUNT_DB_ID = "cmtocgan5000004kzet71p0ka";

import { encryptToken, createTokenRefreshState } from "@/lib/meta/oauth";
import { prisma } from "@/lib/db/client";

const BASE = "https://openreply-zeta-ruby.vercel.app";
const SCOPE = encodeURIComponent("instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_manage_insights");
const CALLBACK_URI = encodeURIComponent(BASE + "/api/instagram/callback");

/** Build the OAuth URL with the fresh token-refresh state on every request. */
function buildOAuthUrl(): string {
  const state = createTokenRefreshState();
  return `https://www.instagram.com/oauth/authorize?client_id=${APP_ID}&redirect_uri=${CALLBACK_URI}&scope=${SCOPE}&response_type=code&state=${encodeURIComponent(state)}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawToken = url.searchParams.get("token");
  const success = url.searchParams.get("success");
  const error = url.searchParams.get("error");

  // Success — redirected back from /api/instagram/callback after token storage
  if (success === "true") {
    return new Response(
      htmlPage("✅ DM access restored!",
        `<div class="success">
           <p><strong>✅ New Instagram token stored securely!</strong></p>
           <p>Valid for ~60 days. Your DM automation is running again.</p>
         </div>
         <p>The inbox, conversations, and all DM features are now working.</p>
         <hr>
         <p style="font-size:13px;color:#666;">
           When this token expires (~60 days from now), come back here and click "Connect Instagram" again.
         </p>`
      ),
      { headers: { "content-type": "text/html" } }
    );
  }

  // Error — from callback or from Instagram direct redirect
  if (error === "denied") {
    return new Response(
      htmlPage("⚠️ Authorization cancelled",
        `<p class="error">Instagram denied the authorization.</p>
         <p>Don't worry — nothing changed. If you meant to authorize, just try again.</p>
         <p><a href="${buildOAuthUrl()}" class="btn" style="display:inline-block;color:white;text-decoration:none;">🔗 Try Again</a></p>
         <hr>
         <p style="color:#666;font-size:13px;">Or paste a token below (see advanced options).</p>
         <form method="get" action="">
           <input type="text" name="token" placeholder="Paste IGAA... token here" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;font-family:monospace;font-size:13px;box-sizing:border-box;">
           <button type="submit" class="btn" style="margin-top:6px;">💾 Store Token</button>
         </form>`
      ),
      { headers: { "content-type": "text/html" } }
    );
  }

  if (error && error !== "denied") {
    return new Response(
      htmlPage("❌ Setup failed",
        `<p class="error">${escapeHtml(decodeURIComponent(error))}</p>
         <p>This might be a temporary issue. Try again:</p>
         <p><a href="${buildOAuthUrl()}" class="btn" style="display:inline-block;color:white;text-decoration:none;">🔗 Connect Instagram</a></p>
         <p><a href="?" style="color:#1877F2;">← Go back</a></p>`
      ),
      { headers: { "content-type": "text/html" } }
    );
  }

  // Handle pasted token
  if (rawToken) {
    return handleTokenPaste(rawToken, req);
  }

  // Default: show the connect page
  return new Response(
    htmlPage("Restore DM Access",
      `<h2>Restore DMs for @stoiczodiac</h2>
       <p>Every ~60 days, Instagram requires a fresh token. Click the button below to re-authorize — it takes about 10 seconds.</p>
       <p style="text-align:center;margin:28px 0;">
         <a href="${buildOAuthUrl()}" class="btn" style="display:inline-block;color:white;text-decoration:none;font-size:18px;padding:14px 32px;">🔗 Connect Instagram</a>
       </p>
       <p style="color:#666;font-size:14px;text-align:center;">
         ✅ You'll be asked to log in to Instagram and approve the permissions.<br>
         ✅ The token is stored securely and lasts ~60 days.<br>
         ✅ Your DMs, inbox, and media will work again immediately.
       </p>
       <hr>
       <details style="font-size:13px;color:#888;">
         <summary style="cursor:pointer;">Advanced: paste a token instead</summary>
         <p>If you prefer, you can get a token from the <a href="https://developers.facebook.com/tools/explorer/${APP_ID}/" target="_blank" style="color:#1877F2;">Graph API Explorer</a> and paste it here:</p>
         <form method="get" action="">
           <input type="text" name="token" placeholder="Paste IGAA... token here" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;font-family:monospace;font-size:13px;box-sizing:border-box;">
           <button type="submit" class="btn" style="margin-top:6px;">💾 Store Token</button>
         </form>
       </details>`
    ),
    { headers: { "content-type": "text/html" } }
  );
}

async function handleTokenPaste(rawToken: string, req: Request): Promise<Response> {
  const token = rawToken.trim();
  if (!token.startsWith("IGAA")) {
    return new Response(
      htmlPage("⚠️ Not an Instagram token",
        `<p class="error">That token doesn't start with <code>IGAA...</code>.</p>
         <p>Facebook tokens (<code>EA...</code>) go in the <em>other</em> helper.</p>
         <p>Instead, try the big <strong>Connect Instagram</strong> button above.</p>
         <p><a href="?" style="color:#1877F2;">← Try again</a></p>`
      ),
      { headers: { "content-type": "text/html" } }
    );
  }

  try {
    let longToken = token;
    let expiresIn: number | null = null;
    try {
      const exchangeUrl = new URL(`https://graph.instagram.com/${API_VER}/access_token`);
      exchangeUrl.searchParams.set("grant_type", "ig_exchange_token");
      exchangeUrl.searchParams.set("client_secret", APP_SECRET);
      exchangeUrl.searchParams.set("access_token", token);
      const resp = await fetch(exchangeUrl);
      const data = await resp.json();
      if (data.access_token) {
        longToken = data.access_token;
        expiresIn = typeof data.expires_in === "number" ? data.expires_in : null;
      }
    } catch { /* use as-is */ }

    const meUrl = new URL(`https://graph.instagram.com/${API_VER}/me`);
    meUrl.searchParams.set("fields", "id,username");
    meUrl.searchParams.set("access_token", longToken);
    const meResp = await fetch(meUrl);
    const me = await meResp.json();

    if (!me.username) {
      let reason = me?.error?.message ?? "The token was rejected by Instagram.";
      return new Response(
        htmlPage("❌ Token rejected",
          `<p class="error">${escapeHtml(reason)}</p>
           <p>Try the <strong>Connect Instagram</strong> button instead — it's simpler.</p>
           <p><a href="?" style="color:#1877F2;">← Try again</a></p>`
        ),
        { headers: { "content-type": "text/html" } }
      );
    }

    const encrypted = encryptToken(longToken);
    const expiresAt = new Date(
      Date.now() + Math.min(expiresIn ?? 60 * 24 * 60 * 60, 60 * 24 * 60 * 60) * 1000
    );
    await prisma.instagramAccount.update({
      where: { id: IG_ACCOUNT_DB_ID },
      data: { accessToken: encrypted, tokenExpiresAt: expiresAt },
    });

    return new Response(
      htmlPage("✅ DM access restored!",
        `<div class="success">
           <p><strong>✅ Token stored for @${escapeHtml(me.username)}</strong></p>
           <p>Valid until <strong>${expiresAt.toLocaleDateString()}</strong> (~60 days).</p>
         </div>
         <p>Your DM automation is running again.</p>`
      ),
      { headers: { "content-type": "text/html" } }
    );
  } catch (e: any) {
    return new Response(
      htmlPage("❌ Error",
        `<p class="error">${escapeHtml(e?.message ?? "Something went wrong")}</p>
         <p><a href="?" style="color:#1877F2;">← Try again</a></p>`
      ),
      { headers: { "content-type": "text/html" } }
    );
  }
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const token = formData.get("token")?.toString().trim() || "";
  const url = new URL(req.url);
  url.searchParams.set("token", token);
  return GET(new Request(url.toString()));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    h2 { font-size: 1.1em; }
    .error { background: #fee; color: #c00; padding: 12px; border-radius: 6px; }
    .success { background: #e8f5e9; color: #0a8a0a; padding: 12px; border-radius: 6px; }
    pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
    code { font-size: 13px; }
    .btn-link { color:#1877F2; word-break: break-all; }
    .btn { background:#1877F2;color:white;border:none;padding:10px 20px;border-radius:6px;font-size:14px;cursor:pointer;margin-top:10px; }
    hr { border: none; border-top: 1px solid #eee; margin: 24px 0; }
    input, button { font-size: 14px; }
    ul { padding-left: 20px; }
    li { margin: 8px 0; }
    details { margin-top: 16px; }
    summary { font-size: 13px; }
  </style>
</head>
<body>
  <h1>🦁 ${title}</h1>
  ${body}
</body>
</html>`;
}