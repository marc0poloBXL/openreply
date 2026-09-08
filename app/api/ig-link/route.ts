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

  // Show status + action page (without OAuth redirect button)
  // Note: OAuth redirect URL is not registered in the Facebook app,
  // so we skip the "Login with Facebook" button and offer paste/manual only.

  return new Response(
    htmlPage("Link Instagram", `
      ${statusHtml}

      <div class="card">
        <h3>Option 1: Manually link via Account Center</h3>
        <ol>
          <li>Open <a href="https://www.facebook.com/settings?tab=account_center" target="_blank">Account Center</a></li>
          <li>Click <strong>"Accounts"</strong> → <strong>"Add accounts"</strong> → <strong>"Add Instagram account"</strong></li>
          <li>Log into <strong>@stoiczodiac</strong></li>
          <li>Go back to Account Center → <strong>"Profiles"</strong> → <strong>"Coupled profiles"</strong></li>
          <li>Add the Stoic Zodiac page and @stoiczodiac together</li>
        </ol>
        <p style="font-size:13px;color:#666;">Alternatively: <a href="https://business.facebook.com/settings/accounts/instagram" target="_blank">Business Settings</a> → Instagram accounts → Add → Claim existing</p>
      </div>

      <div class="card">
        <h3>Option 2: Paste a Facebook User Token (automatic API)</h3>
        <ol>
          <li>Open <a href="https://developers.facebook.com/tools/explorer/${APP_ID}/" target="_blank">Graph API Explorer</a></li>
          <li>Add permissions: <code>pages_manage_metadata</code>, <code>pages_show_list</code>, <code>business_management</code></li>
          <li>Click "Generate Access Token" → authorize all popups</li>
          <li>Make sure it's a <strong>User Token</strong> (dropdown says "User Token", not "Page Token")</li>
          <li>Copy the token (starts with EAA...)</li>
        </ol>
        <form method="post">
          <input type="text" name="token" placeholder="Paste user token (EAA...)">
          <button type="submit">Submit & Link</button>
        </form>
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
    if (!token && request.nextUrl.searchParams.get("token")) {
      token = request.nextUrl.searchParams.get("token");
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