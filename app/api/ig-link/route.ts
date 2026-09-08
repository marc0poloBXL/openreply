import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { decryptToken, encryptToken, exchangeFbLongLivedToken } from "@/lib/meta/oauth";

const IG_ID = "17841438935909153";  // @stoiczodiac
const APP_ID = process.env.FACEBOOK_APP_ID || "1051360407668084";
const API_VERSION = process.env.META_GRAPH_API_VERSION || "v26.0";

const PAGE_ID = "1229304876940609"; // Stoic Zodiac (discovered from token)

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
    .success { color: #16a34a; font-weight: bold; }
    .error { color: #dc2626; }
    input[type=text] { width: 100%; padding: 12px; font-size: 14px; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; }
    button { background: #1877f2; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; cursor: pointer; margin-top: 12px; }
    button:hover { background: #166fe5; }
    a { color: #1877f2; }
    code { background: #e8e8e8; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    pre { background: #1e1e1e; color: #e0e0e0; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 12px; }
    ol li { margin-bottom: 12px; }
  </style>
</head>
<body>
  <h1>🔗 Link @stoiczodiac to Facebook Page</h1>
  ${body}
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");

  // Handle token submission
  if (action === "exchange") {
    const code = request.nextUrl.searchParams.get("code");
    const error = request.nextUrl.searchParams.get("error");
    if (error || !code) {
      return new Response(
        htmlPage("OAuth Error", `<p class="error">${error || "No code received"}</p>`),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // Exchange code for long-lived token
    try {
      const shortTokenRes = await fetch(
        `https://graph.facebook.com/${API_VERSION}/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent("https://openreply-zeta-ruby.vercel.app/api/ig-link?action=exchange")}&client_secret=${process.env.FACEBOOK_APP_SECRET}&code=${code}`,
        { method: "GET" }
      );
      const shortData = await shortTokenRes.json() as Record<string, unknown>;
      if (shortData.error) {
        return new Response(
          htmlPage("Token Error", `<p class="error">Exchange failed: ${JSON.stringify(shortData.error)}</p>`),
          { headers: { "Content-Type": "text/html" } }
        );
      }
      const { accessToken: userToken } = await exchangeFbLongLivedToken(String(shortData.access_token));

      const results = await tryLinkAndStore(userToken);

      return new Response(
        htmlPage("Result", `
          <div class="card">
            <p><strong>Linked:</strong> ${results.linked ? '✅ YES' : '❌ NO'}</p>
            ${results.linked ? '<p class="success">@stoiczodiac is now linked to the Stoic Zodiac page! Comments will work via the page token.</p>' : ''}
            <pre>${JSON.stringify(results, null, 2)}</pre>
          </div>
          ${results.manualSteps ? `<div class="card"><h2>Manual Steps</h2><ol>${results.manualSteps.map(s => `<li>${s}</li>`).join('')}</ol></div>` : ''}
          <p><a href="/api/ig-link">← Back</a></p>
        `),
        { headers: { "Content-Type": "text/html" } }
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return new Response(
        htmlPage("Error", `<p class="error">${msg}</p>`),
        { headers: { "Content-Type": "text/html" } }
      );
    }
  }

  // Show status + action page
  const account = await prisma.instagramAccount.findFirst({
    orderBy: { connectedAt: "desc" },
  });

  const pageToken = account?.pageToken ? decryptToken(account.pageToken) : null;
  const appToken = `${APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;

  let statusHtml = "";
  let currentPageId = PAGE_ID;

  if (pageToken) {
    // Check token scope
    const debugRes = await fetch(
      `https://graph.facebook.com/${API_VERSION}/debug_token?input_token=${encodeURIComponent(pageToken)}&access_token=${appToken}`
    );
    const debug = await debugRes.json();

    statusHtml += `<div class="card">
      <h3>Current Token</h3>
      <p>Type: ${debug.data?.type || "unknown"}</p>
      <p>Scopes: ${debug.data?.scopes?.join(", ") || "none"}</p>
      <p>Expires: ${debug.data?.expires_at ? new Date(debug.data.expires_at * 1000).toLocaleString() : "N/A"}</p>
    </div>`;

    // Discover page ID
    const meRes = await fetch(
      `https://graph.facebook.com/${API_VERSION}/me?fields=id,name&access_token=${encodeURIComponent(pageToken)}`
    );
    const me = await meRes.json() as Record<string, unknown>;
    if (me.id) currentPageId = String(me.id);

    // Check page IG link status
    const pageRes = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${currentPageId}?fields=name,instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`
    );
    const pageData = await pageRes.json() as Record<string, unknown>;

    if (pageData.instagram_business_account) {
      const ig = pageData.instagram_business_account as Record<string, unknown>;
      statusHtml += `<div class="card">
        <p class="success">✅ @stoiczodiac IS linked to "${pageData.name}"</p>
        <p>IG: @${ig.username} (${ig.id})</p>
      </div>`;
    } else {
      statusHtml += `<div class="card">
        <p class="error">❌ @stoiczodiac is NOT linked to "${pageData.name}"</p>
        <p>The page token can't modify the page — we need a User Token.</p>
        <p style="font-size:13px;color:#666;">Page ID: ${currentPageId}</p>
      </div>`;
    }
  }

  // OAuth login URL
  const loginUrl = `https://www.facebook.com/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent("https://openreply-zeta-ruby.vercel.app/api/ig-link?action=exchange")}&scope=pages_manage_metadata,pages_read_engagement,pages_show_list,business_management&response_type=code`;

  return new Response(
    htmlPage("Link Instagram", `
      ${statusHtml}

      <div class="card">
        <h3>Option 1: Click to Authorize (automatic)</h3>
        <p>Click the button below, log into Facebook, and authorize. The app will do the rest.</p>
        <a href="${loginUrl}" style="display:inline-block;background:#1877f2;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:16px;">
          🔗 Login with Facebook
        </a>
        <p style="font-size:12px;color:#666;margin-top:12px;">
          App ID: ${APP_ID} — Redirects back here automatically
        </p>
      </div>

      <div class="card">
        <h3>Option 2: Graph API Explorer (manual)</h3>
        <ol>
          <li>Open <a href="https://developers.facebook.com/tools/explorer/${APP_ID}/" target="_blank">Graph API Explorer</a></li>
          <li>Add permissions: <code>pages_manage_metadata</code>, <code>pages_show_list</code></li>
          <li>Click "Generate Access Token" → authorize</li>
          <li>Click "Get User Access Token" → make sure it's a <strong>User Token</strong></li>
          <li>Copy the token (starts with EAA...)</li>
        </ol>
        <form method="post">
          <input type="text" name="token" placeholder="Paste user token (EAA...)">
          <button type="submit">Submit & Link</button>
        </form>
      </div>

      <div class="card">
        <h3>Option 3: If all else fails</h3>
        <p>Open <a href="https://www.facebook.com/settings?tab=account_center" target="_blank">Account Center</a> → Accounts → Add Instagram account → log into @stoiczodiac</p>
        <p>If that doesn't work, try <a href="https://business.facebook.com/settings/accounts/instagram" target="_blank">Business Settings → Instagram accounts</a> → Add → Claim existing</p>
      </div>
    `),
    { headers: { "Content-Type": "text/html" } }
  );
}

export async function POST(request: NextRequest) {
  let token: string | null = null;

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json() as { token?: string };
    token = body.token || null;
  } else {
    const formData = await request.formData();
    token = String(formData.get("token") || "");
    // Also check URL params
    if (!token) {
      token = request.nextUrl.searchParams.get("token");
    }
  }

  // Check if OAuth code was received
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const shortTokenRes = await fetch(
      `https://graph.facebook.com/${API_VERSION}/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent("https://openreply-zeta-ruby.vercel.app/api/ig-link")}&client_secret=${process.env.FACEBOOK_APP_SECRET}&code=${code}`,
      { method: "GET" }
    );
    const shortData = await shortTokenRes.json() as Record<string, unknown>;
    if (shortData.access_token) {
      token = String(shortData.access_token);
    }
  }

  if (!token) {
    return NextResponse.json({ error: "No token provided" }, { status: 400 });
  }

  // Make it long-lived
  const { accessToken: userToken } = await exchangeFbLongLivedToken(token);

  const results = await tryLinkAndStore(userToken);
  return NextResponse.json(results);
}

async function tryLinkAndStore(userToken: string) {
  const results: Record<string, unknown> = {
    tokenExchanged: true,
    linked: false,
    steps: {} as Record<string, unknown>,
  };

  // Try to link: POST /{page-id}/instagram_accounts with user token
  const linkRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${PAGE_ID}/instagram_accounts`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: userToken, instagram_account_id: IG_ID }),
    }
  );
  const linkData = await linkRes.json() as Record<string, unknown>;
  results.steps = { ...(results.steps as Record<string, unknown>), link_attempt: linkData };

  if (linkData.success || linkData.id) {
    results.linked = true;
  }

  // Verify
  const verifyRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${PAGE_ID}?fields=name,instagram_business_account{id,username}&access_token=${encodeURIComponent(userToken)}`
  );
  const verifyData = await verifyRes.json() as Record<string, unknown>;
  const igBiz = verifyData.instagram_business_account as Record<string, unknown> | undefined;
  results.steps = { ...(results.steps as Record<string, unknown>), verify: verifyData };

  if (igBiz && String(igBiz.id) === IG_ID) {
    results.linked = true;
    results.steps = { ...(results.steps as Record<string, unknown>), verified: true };
  }

  // Store the new token
  try {
    const encrypted = encryptToken(userToken);
    const account = await prisma.instagramAccount.findFirst({
      orderBy: { connectedAt: "desc" },
    });
    if (account) {
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: { pageToken: encrypted },
      });
      results.tokenStored = true;
    }
  } catch (e) {
    results.tokenStoreError = e instanceof Error ? e.message : "Unknown error";
  }

  if (!results.linked) {
    results.manualSteps = [
      "Open <a href='https://www.facebook.com/settings?tab=account_center' target='_blank'>Account Center</a>",
      "Click 'Accounts' → 'Add accounts' → 'Add Instagram account'",
      "Log into @stoiczodiac",
      "Then go to Account Center → 'Profiles' → 'Coupled profiles'",
      "Add the Stoic Zodiac page and @stoiczodiac together",
    ];
  }

  return results;
}