import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";

const IG_ID = "17841438935909153";
const PAGE_ID = "1229304876940609";
const PAGE_NAME = "Stoic Zodiac";

export async function GET() {
  const html = await buildPage();
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

async function buildPage(): Promise<string> {
  const entries: string[] = [];
  function log(msg: string) { entries.push(`  <div>${msg}</div>`); }

  const account = await prisma.instagramAccount.findFirst({ orderBy: { connectedAt: "desc" } });
  const token = account?.pageToken ? decryptToken(account.pageToken) : null;

  if (token) {
    for (const pid of [PAGE_ID, "61594011424463"]) {
      try {
        const r = await fetch(
          `https://graph.facebook.com/v26.0/${pid}?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`
        );
        const d = (await r.json()) as Record<string, unknown>;
        if (d.error) { continue; }
        const name = d.name || "?";
        const igBiz = d.instagram_business_account as Record<string, unknown> | undefined;
        if (igBiz && igBiz.id === IG_ID) {
          return wrapHtml(`<span class="success">✅ @stoiczodiac IS linked to "${name}"!</span>
<p>Comment reading via graph.facebook.com should work now.</p>`);
        }
      } catch { /* skip */ }
    }
  }

  return wrapHtml(`
    <p>@stoiczodiac is <span class="error">NOT linked</span> to the Stoic Zodiac page.</p>
    <p>Use the <strong>Token Helper</strong> tool below to fix this — no phone navigation needed.</p>

    <hr>
    <h2>🔧 Solution: Token Helper (Graph API Explorer)</h2>
    <div class="card">
      <p><strong>Step 1:</strong> Open the Graph API Explorer:</p>
      <p><a href="https://developers.facebook.com/tools/explorer/1051360407668084/" target="_blank" class="btn">🔗 Open Graph API Explorer</a></p>

      <p><strong>Step 2:</strong> In the Explorer:</p>
      <ol>
        <li>Set the dropdown to <strong>"User Token"</strong> (not Page Token)</li>
        <li>Click <strong>"Add permissions"</strong> → add: <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>business_management</code>, <code>pages_manage_metadata</code></li>
        <li>Click <strong>"Generate Access Token"</strong> → authorize everything</li>
        <li>Copy the token (starts with <code>EAA...</code>)</li>
      </ol>

      <p><strong>Step 3:</strong> Paste the token here:</p>
      <p><a href="/api/auth/token-helper" class="btn">🔑 Go to Token Helper</a></p>
      <p style="font-size:13px;color:#555;">Paste your token there and submit. It will exchange it, find the Stoic Zodiac page, store the token, AND try to link @stoiczodiac to the page automatically.</p>
    </div>

    <hr>
    <p><a href="/api/ig-link" class="btn">↻ Check status</a></p>
  `);
}

function wrapHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Link @stoiczodiac</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;line-height:1.5;color:#111}
  h1{font-size:24px} h2{font-size:17px;margin-top:20px}
  .card{background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:20px;margin:16px 0}
  .error{color:#dc2626;font-weight:600}
  .success{color:#16a34a;font-weight:600}
  .btn{display:inline-block;background:#1877f2;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:500;margin:4px}
  .btn:hover{background:#166fe5}
  ol li{margin-bottom:8px}
  a{color:#1877f2}
  code{background:#f0f0f0;padding:2px 6px;border-radius:4px;font-size:13px}
  hr{border:none;border-top:1px solid #e0e0e0;margin:24px 0}
</style>
</head>
<body>
<h1>🔗 @stoiczodiac (${IG_ID}) → "${PAGE_NAME}"</h1>
${body}
</body></html>`;
}