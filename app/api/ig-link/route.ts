import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";

const IG_ID = "17841438935909153";
const PAGE_ID = "1229304876940609";

/**
 * GET /api/ig-link
 *
 * One-page HTML tool to:
 * 1. Check if @stoiczodiac is linked to the Stoic Zodiac page
 * 2. If not, try to link it using the stored page token
 * 3. Show clear results + manual fallback instructions
 */
export async function GET() {
  const pageHtml = await buildPage();
  return new Response(pageHtml, {
    headers: { "Content-Type": "text/html" },
  });
}

async function buildPage(): Promise<string> {
  const status = await checkLinkStatus();
  const linkResult = await tryLink();
  const parts = [header()];

  parts.push(statusCard(status));

  if (!status.linked) {
    parts.push(`<h2>Try Automatic Link</h2>`);
    parts.push(linkResult ? linkResultCard(linkResult) : loadingCard());
    if (!linkResult?.success) {
      parts.push(manualInstructions());
    }
  }

  parts.push(debugCard(status));
  parts.push(footer());
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link @stoiczodiac</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 20px; line-height: 1.5; color: #111; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .subtitle { color: #555; margin-top: 0; font-size: 14px; }
    .card { background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; padding: 20px; margin: 16px 0; }
    .card p { margin: 6px 0; }
    .success { color: #16a34a; font-weight: 600; }
    .error { color: #dc2626; font-weight: 600; }
    .warn { color: #d97706; font-weight: 600; }
    .info { background: #f0f7ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 8px; margin: 12px 0; }
    .btn { display:inline-block; background:#1877f2; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-size:16px; font-weight:500; }
    .btn:hover { background:#166fe5; }
    .btn:disabled { opacity: 0.5; pointer-events: none; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    pre { background: #1e1e1e; color: #e0e0e0; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 12px; }
    ol li, ul li { margin-bottom: 6px; }
    hr { border: none; border-top: 1px solid #e0e0e0; margin: 24px 0; }
  </style>
</head>
<body>
${parts.join("\n\n")}
</body>
</html>`;
}

function header(): string {
  return `
<h1>🔗 Link @stoiczodiac to Facebook Page</h1>
<p class="subtitle">IG ID: ${IG_ID} · Page ID: ${PAGE_ID} · App: stoiczodiac-dm (1051360407668084)</p>`;
}

function footer(): string {
  return `
<hr>
<p style="font-size:12px;color:#888;text-align:center;">
  <a href="https://openreply-zeta-ruby.vercel.app/api/ig-link">Refresh page</a> to re-check status
</p>`;
}

/** Check if @stoiczodiac is already linked */
async function checkLinkStatus(): Promise<{
  linked: boolean;
  linkedTo?: string;
  linkedUsername?: string;
  tokenExists: boolean;
  tokenPrefix?: string;
  pageName?: string;
  apiError?: string;
}> {
  const result = {
    linked: false,
    linkedTo: undefined as string | undefined,
    linkedUsername: undefined as string | undefined,
    tokenExists: false,
    tokenPrefix: undefined as string | undefined,
    pageName: undefined as string | undefined,
    apiError: undefined as string | undefined,
  };

  try {
    const account = await prisma.instagramAccount.findFirst({
      orderBy: { connectedAt: "desc" },
    });
    const token = account?.pageToken
      ? decryptToken(account.pageToken)
      : null;
    result.tokenExists = !!token;
    result.tokenPrefix = token ? token.substring(0, 15) + "..." : undefined;

    if (!token) return result;

    // Check the page
    const pageRes = await fetch(
      `https://graph.facebook.com/v26.0/${PAGE_ID}?fields=name,instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`
    );
    const pageData = (await pageRes.json()) as Record<string, unknown>;
    result.pageName = pageData.name as string | undefined;

    const igBiz = pageData.instagram_business_account as
      | { id: string; username: string }
      | undefined;
    if (igBiz) {
      result.linked = igBiz.id === IG_ID;
      result.linkedTo = igBiz.id;
      result.linkedUsername = igBiz.username;
    }
  } catch (e) {
    result.apiError = e instanceof Error ? e.message : "Unknown error";
  }

  return result;
}

function statusCard(status: Awaited<ReturnType<typeof checkLinkStatus>>): string {
  let statusLine: string;
  if (status.tokenExists) {
    if (status.linked) {
      statusLine = `<p class="success">✅ @stoiczodiac IS linked to "${status.pageName}" (IG username: @${status.linkedUsername})</p>
<p>Comment reading via graph.facebook.com should work.</p>`;
    } else if (status.linkedTo) {
      statusLine = `<p class="warn">⚠️ Page "${status.pageName}" is linked to @${status.linkedUsername} (${status.linkedTo}), NOT @stoiczodiac</p>`;
    } else {
      statusLine = `<p class="error">❌ Page "${status.pageName || PAGE_ID}" has NO linked Instagram account</p>`;
    }
  } else {
    statusLine = `<p class="error">❌ No page token stored in database</p>`;
  }

  if (status.apiError) {
    statusLine += `<p class="error">API error: ${status.apiError}</p>`;
  }

  return `<div class="card">${statusLine}</div>`;
}

/** Try to link via Graph API using stored page token */
async function tryLink(): Promise<{
  success: boolean;
  message: string;
  errorCode?: number;
  errorMessage?: string;
  errorUserMessage?: string;
} | null> {
  try {
    const account = await prisma.instagramAccount.findFirst({
      orderBy: { connectedAt: "desc" },
    });
    const token = account?.pageToken
      ? decryptToken(account.pageToken)
      : null;
    if (!token) return { success: false, message: "No page token found in database" };

    // Try POST /{page-id}/instagram_accounts
    const linkRes = await fetch(
      `https://graph.facebook.com/v26.0/${PAGE_ID}/instagram_accounts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: token,
          instagram_account_id: IG_ID,
        }),
      }
    );
    const linkData = (await linkRes.json()) as Record<string, unknown>;

    if (linkData.success) {
      return { success: true, message: "✅ Linked via Graph API! @stoiczodiac is now connected." };
    }

    const err = (linkData.error || {}) as Record<string, unknown>;
    return {
      success: false,
      message: `❌ API returned error (code: ${err.code || "?"})`,
      errorCode: err.code as number,
      errorMessage: err.message as string,
      errorUserMessage: err.error_user_msg as string,
    };
  } catch (e) {
    return {
      success: false,
      message: `❌ Exception: ${e instanceof Error ? e.message : e}`,
    };
  }
}

function linkResultCard(
  result: NonNullable<Awaited<ReturnType<typeof tryLink>>>
): string {
  let content = `<p>${result.message}</p>`;

  if (result.errorUserMessage) {
    content += `<div class="info">${result.errorUserMessage}</div>`;
  }
  if (result.errorMessage) {
    content += `<p style="font-size:12px;color:#666;">Debug: ${result.errorMessage} (code: ${result.errorCode})</p>`;
  }

  if (result.success) {
    return `<div class="card">${content}</div>`;
  }

  return `<div class="card">${content}</div>`;
}

function loadingCard(): string {
  return `<div class="card"><p>⏳ Attempting to link via API...</p></div>`;
}

function debugCard(status: Awaited<ReturnType<typeof checkLinkStatus>>): string {
  return `
<div class="card" style="font-size:12px;color:#666;">
  <p><strong>Debug info:</strong></p>
  <p>Token exists: ${status.tokenExists}${status.tokenPrefix ? " (" + status.tokenPrefix + ")" : ""}</p>
  <p>Page name: ${status.pageName || "N/A"}</p>
  <p>Linked IG: ${status.linkedUsername ? "@" + status.linkedUsername : "none"}</p>
  <p>Linked IG ID: ${status.linkedTo || "none"}</p>
  <p>Expected IG ID: ${IG_ID}</p>
</div>`;
}

function manualInstructions(): string {
  return `
<div class="card">
  <h3>📱 Manual linking (if API fails)</h3>
  <p>The Graph API may not have permission to link accounts. To do it manually:</p>
  <ol>
    <li>Open the <strong>Instagram app</strong> on your phone</li>
    <li>Go to your <strong>profile</strong> (bottom right person icon)</li>
    <li>Tap the ☰ menu (top right) → <strong>Account Center</strong> (or Settings → Account Center)</li>
    <li>Tap <strong>Accounts</strong> → <strong>Linked Accounts</strong> → <strong>Facebook</strong></li>
    <li>Find and select <strong>"Stoic Zodiac"</strong> (the Facebook Page, not your personal profile)</li>
    <li>If "Stoic Zodiac" doesn't appear, you may need to add it via <strong>Facebook Settings</strong> → Account Center → Profiles → Add</li>
  </ol>
  <div class="info">
    <strong>Alternative:</strong> Try right now in your Instagram app — go to Settings → Account Center → Accounts → Linked Accounts → Facebook and connect "Stoic Zodiac".
  </div>
  <p style="margin-top:12px;"><a href="/api/ig-link" class="btn">↻ Refresh status</a></p>
</div>`;
}