/**
 * IGAA Token Helper — Server-Side Only
 *
 * Paste an Instagram Business Login (IGAA) access token.
 * This page extends it to a long-lived token (60 days) and stores it in the
 * database — one step, no OAuth redirects. This is the token that powers DM
 * sending, the inbox, and media reads on graph.instagram.com.
 *
 * If the pasted token is already long-lived, the exchange is skipped and the
 * token is stored as-is.
 */

const APP_ID = process.env.INSTAGRAM_APP_ID || "2616058292165458";
const APP_SECRET =
  process.env.INSTAGRAM_APP_SECRET || "6f741ede5b48248317cc9cecd50a4ab4";
const API_VER = process.env.META_GRAPH_API_VERSION || "v26.0";
const IG_ACCOUNT_DB_ID = "cmtocgan5000004kzet71p0ka";

import { encryptToken } from "@/lib/meta/oauth";
import { prisma } from "@/lib/db/client";

const INSTAGRAM_LOGIN_URL = `https://developers.facebook.com/apps/${APP_ID}/instagram/business-login/`;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawToken = url.searchParams.get("token");

  if (!rawToken) {
    return new Response(
      htmlPage(
        "Get Instagram Token",
        `<h2>Restore DM access for @stoiczodiac</h2>
         <p>Facebook requires a brand-new Instagram token every ~60 days. You'll get it once, paste it once — I'll store it securely for you.</p>
         <p><strong>Step 1:</strong> Open Facebook's developer page for your Instagram app:</p>
         <p><a href="${INSTAGRAM_LOGIN_URL}" target="_blank" class="btn-link">${INSTAGRAM_LOGIN_URL}</a></p>
         <ul>
           <li>Click the blue <strong>"Get access token"</strong> / <strong>"Generate token"</strong> button</li>
           <li>Allow the popups — make sure <strong>@stoiczodiac</strong> is selected</li>
           <li>The token starts with <code>IGAA...</code> — copy it</li>
         </ul>
         <p><strong>Step 2:</strong> Paste it here:</p>
         <form method="get" action="">
           <input type="text" name="token" placeholder="Paste IGAA... token here"
                  style="width:100%;padding:10px;border:1px solid #ccc;border-radius:6px;font-family:monospace;font-size:13px;box-sizing:border-box;">
           <button type="submit" class="btn">💾 Store Token &amp; Restore DMs</button>
         </form>
         <p style="color:#666;font-size:13px;margin-top:16px;">
           ⚡ The system will exchange the token for a 60-day one and save it.
           No coding, no logins to your dashboard.
         </p>
         <hr>
         <p style="color:#666;font-size:12px;">
           Optional: instead of the dashboard button above, you can also generate the
           token in the <a href="https://developers.facebook.com/tools/explorer/${APP_ID}/" target="_blank" style="color:#1877F2;">Graph API Explorer</a>
           — select your app, hit "Generate Access Token", and authorize the Instagram permissions
           (<code>instagram_business_basic</code>, <code>instagram_business_manage_messages</code>,
           <code>instagram_business_manage_comments</code>, <code>instagram_business_manage_insights</code>).
         </p>`
      ),
      { headers: { "content-type": "text/html" } }
    );
  }

  const token = rawToken.trim();
  if (!token.startsWith("IGAA")) {
    return new Response(
      htmlPage("⚠️ Not an Instagram token",
        `<p class="error">That token doesn't start with <code>IGAA...</code>.</p>
         <p>Facebook tokens (<code>EA...</code>) go in the <em>other</em> helper — this page is only for the Instagram token from the dashboard button above.</p>
         <p><a href="?" style="color:#1877F2;">← Try again</a></p>`
      ),
      { headers: { "content-type": "text/html" } }
    );
  }

  try {
    // Step 1: Extend to a long-lived token (60 days).
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
      // Non-long-lived or already-long-lived tokens return an error object —
      // fall through and store the pasted token as-is.
    } catch { /* network hiccup — use as-is */ }

    // Step 2: Verify the token against Instagram before storing anything.
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
           <p>This usually means the token is expired or was copied completely. Head back to
              <a href="${INSTAGRAM_LOGIN_URL}" target="_blank" style="color:#1877F2;">the dashboard button</a>
              and generate a fresh one, then paste it again.</p>
           <p><a href="?" style="color:#1877F2;">← Try again</a></p>`
        ),
        { headers: { "content-type": "text/html" } }
      );
    }

    // Step 3: Store encrypted.
    const encrypted = encryptToken(longToken);
    const expiresAt = new Date(
      Date.now() + Math.min(expiresIn ?? 60 * 24 * 60 * 60, 60 * 24 * 60 * 60) * 1000
    );
    await prisma.instagramAccount.update({
      where: { id: IG_ACCOUNT_DB_ID },
      data: { accessToken: encrypted, tokenExpiresAt: expiresAt },
    });

    // Step 4: Try to re-subscribe webhooks so comment/DM events keep flowing.
    let subscribed: boolean | null = null;
    try {
      const subResp = await fetch(
        `https://graph.facebook.com/${API_VER}/${me.id}/subscribed_apps`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: longToken,
            subscribed_fields: "comments,messages",
          }),
        }
      );
      const sub = await subResp.json();
      subscribed = Boolean(sub.success || sub.id);
    } catch { /* non-critical */ }

    return new Response(
      htmlPage("✅ DM access restored!",
        `<div class="success">
           <p><strong>✅ Token stored for @${escapeHtml(me.username)}</strong></p>
           <p>Valid until <strong>${expiresAt.toLocaleDateString()}</strong> (~60 days).</p>
           <p><strong>✅ Webhooks:</strong> ${subscribed ? "resubscribed" : "app-level subscription already handles them"}</p>
         </div>
         <p>Your DM automation is running again. Comments, DMs, and the inbox will now work.</p>
         <hr>
         <p style="font-size:13px;color:#666;">
           When this token expires (~60 days from now), come back to this page and paste a fresh one.
           It takes about a minute.
         </p>`
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
    .error { background: #fee; color: #c00; padding: 12px; border-radius: 6px; }
    .success { background: #e8f5e9; color: #0a8a0a; padding: 12px; border-radius: 6px; }
    pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
    code { font-size: 13px; }
    .btn-link { color:#1877F2; word-break: break-all; }
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