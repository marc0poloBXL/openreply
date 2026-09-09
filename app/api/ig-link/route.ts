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
    try {
      const r = await fetch(
        `https://graph.facebook.com/v26.0/${PAGE_ID}?fields=name,instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`
      );
      const d = (await r.json()) as Record<string, unknown>;
      if (d.instagram_business_account) {
        const ig = d.instagram_business_account as Record<string, unknown>;
        if (ig.id === IG_ID) {
          return wrapHtml(`<span class="success">✅ @stoiczodiac IS linked to "${PAGE_NAME}"!</span>
<p>Comment reading via graph.facebook.com should work.</p>`);
        }
        log(`⚠️ Page linked to @${ig.username} (${ig.id}) instead of @stoiczodiac`);
      } else {
        log(`<span class="error">❌ "${PAGE_NAME}" has NO linked Instagram account</span>`);
      }
    } catch { log(`<span class="error">❌ Cannot check page status</span>`); }
  } else {
    log(`<span class="error">❌ No page token stored</span>`);
  }

  return wrapHtml(`
    ${entries.join("\n")}

    <div class="card" style="border-left:4px solid #dc2626;background:#fff5f5;">
      <h2>📱 Manual linking required</h2>
      <p>The Facebook app doesn't have the API permissions needed to link Instagram accounts. You <strong>must</strong> do this manually in the Instagram app:</p>

      <h3>Method A: Account Center (easiest)</h3>
      <ol>
        <li>Open the <strong>Instagram app</strong> on your phone</li>
        <li>Go to your <strong>profile</strong> (bottom right icon)</li>
        <li>Tap ☰ menu (top right) → <strong>Account Center</strong></li>
        <li>Tap <strong>Accounts</strong> → <strong>Linked Accounts</strong> → <strong>Facebook</strong></li>
        <li>If "Stoic Zodiac" is listed, select it. If not listed, tap <strong>"Add"</strong> and search for "Stoic Zodiac"</li>
        <li>Make sure you select the <strong>Page</strong> (not your personal profile)</li>
      </ol>

      <h3>Method B: Facebook Page Settings</h3>
      <ol>
        <li>Open Facebook in browser</li>
        <li>Go to <strong>"Stoic Zodiac"</strong> page</li>
        <li>Click <strong>Settings</strong> at the top</li>
        <li>Click <strong>Instagram</strong> in the left menu</li>
        <li>Click <strong>Connect Account</strong> → Log in as @stoiczodiac</li>
      </ol>

      <h3>Method C: Business Manager</h3>
      <ol>
        <li>Go to <strong>business.facebook.com</strong> → Business Manager "marc jelen"</li>
        <li>Select <strong>"Stoic Zodiac"</strong> page under Pages</li>
        <li>Go to <strong>Settings</strong> → <strong>Instagram Accounts</strong></li>
        <li>Click <strong>Add</strong> and follow the prompts for @stoiczodiac</li>
      </ol>

      <p>After you do any of these, click the button below to verify:</p>
      <p><a href="/api/ig-link" class="btn">↻ Check link status</a></p>
    </div>
  `);
}

function wrapHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Link @stoiczodiac</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;line-height:1.5;color:#111}
  h1{font-size:24px} h2{font-size:17px;margin-top:20px} h3{font-size:15px;margin-top:16px}
  .card{background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:20px;margin:16px 0}
  .card div{padding:3px 0;font-family:monospace;font-size:13px}
  .error{color:#dc2626;font-weight:600}
  .success{color:#16a34a;font-weight:600}
  .btn{display:inline-block;background:#1877f2;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:500}
  ol li{margin-bottom:8px}
</style>
</head>
<body>
<h1>🔗 Link @stoiczodiac (${IG_ID}) → "${PAGE_NAME}" (${PAGE_ID})</h1>
${body}
</body></html>`;
}