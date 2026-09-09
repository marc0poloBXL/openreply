import { prisma } from "@/lib/db/client";
import { decryptToken, createOAuthState } from "@/lib/meta/oauth";
import { getBaseUrl } from "@/lib/env";

const IG_ID = "17841438935909153";
const PAGE_ID = "1229304876940609";
const APP_ID = process.env.FACEBOOK_APP_ID || "1051360407668084";

/**
 * GET /api/ig-link
 *
 * Debug page that:
 * 1. Checks current link status + token scopes
 * 2. Tries to link @stoiczodiac to the Stoic Zodiac page via API
 * 3. Provides a "Get fresh token" link using the already-registered callback
 * 4. Shows results from the callback (via query params)
 */
export async function GET() {
  const html = await buildPage();
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

async function buildPage(): Promise<string> {
  const entries: string[] = [];

  function log(msg: string) {
    entries.push(`  <div>${msg}</div>`);
  }

  // Handle messages from callback redirect
  const baseUrl = getBaseUrl();
  const msg = entries.length > 0 ? "" : ""; // placeholder — we use URL params

  // Decrypt token
  const account = await prisma.instagramAccount.findFirst({
    orderBy: { connectedAt: "desc" },
  });
  const token = account?.pageToken ? decryptToken(account.pageToken) : null;
  if (!token) {
    entries.push(`<div class="error">❌ No page token in database</div>`);
  }

  if (token) {
    log(`Token prefix: ${token.substring(0, 20)}...`);

    // 1. Debug token scopes
    log(`<b>Step 1: Token scope check</b>`);
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (appSecret) {
      const appToken = `${APP_ID}|${appSecret}`;
      try {
        const r = await fetch(
          `https://graph.facebook.com/v26.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`
        );
        const d = (await r.json()) as Record<string, unknown>;
        const data = (d.data || d) as Record<string, unknown>;
        log(`App: ${data.app_id} (${data.type})`);
        log(`Valid: ${String(data.is_valid)}`);
        const scopes = (data.scopes as string[]) || [];
        log(`Scopes: ${scopes.join(", ") || "none"}`);
        log(`pages_manage_metadata: ${scopes.includes("pages_manage_metadata") ? "✅ YES" : "❌ NO — this is required for API linking"}`);
        log(`pages_manage_instagram: ${scopes.includes("pages_manage_instagram") ? "✅ YES" : "❌ NO"}`);
      } catch (e) {
        log(`Debug failed: ${e instanceof Error ? e.message : e}`);
      }
    } else {
      log(`⚠️ No FACEBOOK_APP_SECRET available locally`);
    }

    // 2. Check page
    log(`<b>Step 2: Page status</b>`);
    try {
      const r = await fetch(
        `https://graph.facebook.com/v26.0/${PAGE_ID}?fields=name,instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`
      );
      const d = (await r.json()) as Record<string, unknown>;
      log(`Page name: ${d.name}`);
      if (d.instagram_business_account) {
        const ig = d.instagram_business_account as Record<string, unknown>;
        if (ig.id === IG_ID) {
          log(`<span class="success">✅ @stoiczodiac IS linked! IG: @${ig.username}</span>`);
        } else {
          log(`<span class="error">⚠️ Linked to different IG: @${ig.username} (${ig.id})</span>`);
        }
      } else {
        log(`<span class="error">❌ No Instagram account linked to this page</span>`);
      }
      if (d.error) log(`Error: ${JSON.stringify(d.error)}`);
    } catch (e) {
      log(`Page check failed: ${e instanceof Error ? e.message : e}`);
    }

    // 3. Try to link via API — two methods
    log(`<b>Step 3a: POST /${PAGE_ID}/instagram_accounts</b>`);
    try {
      const r = await fetch(
        `https://graph.facebook.com/v26.0/${PAGE_ID}/instagram_accounts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: token, instagram_account_id: IG_ID }),
        }
      );
      const d = (await r.json()) as Record<string, unknown>;
      if (d.success) { log(`<span class="success">✅ LINKED via /page/instagram_accounts!</span>`); }
      else {
        const e = (d.error || {}) as Record<string, unknown>;
        log(`<span class="error">❌ Failed (code: ${e.code})</span>`);
        log(`Message: ${e.message}`);
      }
    } catch (e) { log(`Link failed: ${e instanceof Error ? e.message : e}`); }

    log(`<b>Step 3b: POST /${IG_ID}/owner (set owner page)</b>`);
    try {
      const r = await fetch(
        `https://graph.facebook.com/v26.0/${IG_ID}/owner`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: token, page_id: PAGE_ID }),
        }
      );
      const d = (await r.json()) as Record<string, unknown>;
      if (d.success) { log(`<span class="success">✅ LINKED via /ig/owner!</span>`); }
      else {
        const e = (d.error || {}) as Record<string, unknown>;
        log(`<span class="error">❌ Failed (code: ${e.code})</span>`);
        log(`Message: ${e.message}`);
      }
    } catch (e) { log(`Link failed: ${e instanceof Error ? e.message : e}`); }
  }

  // 4. Get fresh token — uses registered callback
  const fbLoginUrl = buildFbLoginUrl(baseUrl);

  return wrapHtml(`
    ${entries.join("\n")}
    <hr>
    <h2>🔑 Get a fresh token with pages_manage_metadata</h2>
    <p>The current token may lack the required scope. Get a fresh one:</p>
    <ol>
      <li><strong>Make sure you're logged into Facebook</strong> as the admin of "Stoic Zodiac"</li>
      <li>Click: <a href="${fbLoginUrl}" class="btn">🔑 Get fresh token</a></li>
      <li>Authorize the app (you'll see a warning — click "Continue")</li>
      <li>You'll be redirected back here automatically</li>
    </ol>
    <div class="info">
      <p>⚠️ Facebook may show a warning since the app is in development mode. Just click "Continue" — it's your own app.</p>
    </div>

    <h2>📱 Manual linking (if API still fails)</h2>
    <p>On your phone in the <strong>Instagram app</strong>:</p>
    <ol>
      <li>Profile → ☰ menu → <strong>Account Center</strong></li>
      <li>Accounts → Linked Accounts → <strong>Facebook</strong></li>
      <li>Find <strong>"Stoic Zodiac"</strong> and connect it</li>
      <li>Make sure it's the Page, not your personal profile</li>
    </ol>
    <p><a href="/api/ig-link" class="btn">↻ Refresh page</a></p>
  `);
}

function buildFbLoginUrl(baseUrl: string): string {
  const redirectUri = `${baseUrl}/api/instagram/callback/facebook`;
  const state = createOAuthState("ig-link-standalone");
  return `https://www.facebook.com/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=pages_manage_metadata,pages_read_engagement,pages_show_list&response_type=code&state=${state}`;
}

function wrapHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IG Link Tool</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.5;color:#111}
    h1{font-size:24px}
    h2{font-size:18px;margin-top:24px}
    .card{background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:20px;margin:16px 0}
    .card div{padding:3px 0;border-bottom:1px solid #f0f0f0;font-family:monospace;font-size:13px}
    .card div:last-child{border-bottom:none}
    .error{color:#dc2626;font-weight:600}
    .success{color:#16a34a;font-weight:600}
    .warn{color:#d97706;font-weight:600}
    .btn{display:inline-block;background:#1877f2;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:500;margin:4px}
    .btn:hover{background:#166fe5}
    code{background:#f0f0f0;padding:2px 6px;border-radius:4px;font-size:13px}
    pre{background:#1e1e1e;color:#e0e0e0;padding:16px;border-radius:8px;overflow-x:auto;font-size:12px}
    .info{background:#f0f7ff;border-left:4px solid #3b82f6;padding:12px 16px;border-radius:8px;margin:12px 0}
    ol li{margin-bottom:6px}
    hr{border:none;border-top:1px solid #e0e0e0;margin:24px 0}
  </style>
</head>
<body>
  <h1>🔗 Link @stoiczodiac (${IG_ID}) to Page ${PAGE_ID}</h1>
  <div class="card">
    ${body}
  </div>
</body>
</html>`;
}