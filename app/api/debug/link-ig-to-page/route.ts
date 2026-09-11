import { prisma } from "@/lib/db/client";
import { encryptToken, decryptToken } from "@/lib/meta/oauth";

const APP_ID = "1051360407668084";
const APP_SECRET = "b2708ce0c790783fbf27c0dfcc0e1459";
const IG_ID = "17841438935909153";
const PAGE_ID = "1229304876940609";
const BM_ID = "2052016095704629";

export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userToken = url.searchParams.get("token");
  const action = url.searchParams.get("action") || "link";

  // Show the form if no token provided
  if (!userToken) {
    return new Response(html(), { headers: { "content-type": "text/html" } });
  }

  const results: Record<string, unknown> = {};

  try {
    // Exchange short-lived token for 60-day token
    const exchangeResp = await fetch(
      `https://graph.facebook.com/v26.0/oauth/access_token?grant_type=fb_exchange_token` +
      `&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${encodeURIComponent(userToken.trim())}`
    );
    const exchangeData = await exchangeResp.json();
    if (!exchangeData.access_token) {
      return json({ error: "Token exchange failed", detail: exchangeData.error?.message || exchangeData.error });
    }
    const longLivedToken = exchangeData.access_token;
    results.token_exchange = "✅ Success — 60-day token obtained";
    results.token_user_id = exchangeData.user_id || "unknown";

    if (action === "scope-check") {
      // Just check what the token can see
      const meResp = await fetch(`https://graph.facebook.com/v26.0/me?fields=id,name,email&access_token=${encodeURIComponent(longLivedToken)}`);
      results.me = await meResp.json();

      const bmResp = await fetch(`https://graph.facebook.com/v26.0/${BM_ID}?fields=id,name&access_token=${encodeURIComponent(longLivedToken)}`);
      results.bm_access = await bmResp.json();

      const accountsResp = await fetch(`https://graph.facebook.com/v26.0/me/accounts?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(longLivedToken)}`);
      results.pages = await accountsResp.json();

      const bmIgsResp = await fetch(`https://graph.facebook.com/v26.0/${BM_ID}/owned_instagram_accounts?fields=id,username,name&access_token=${encodeURIComponent(longLivedToken)}`);
      results.bm_ig_accounts = await bmIgsResp.json();

      const bmPagesResp = await fetch(`https://graph.facebook.com/v26.0/${BM_ID}/owned_pages?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(longLivedToken)}`);
      results.bm_pages = await bmPagesResp.json();
    } else if (action === "link") {
      // Try to link IG to page via user token
      try {
        const linkResp = await fetch(`https://graph.facebook.com/v26.0/${PAGE_ID}/instagram_accounts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: longLivedToken,
            instagram_account_id: IG_ID
          }),
        });
        results.link_result = await linkResp.json();
      } catch (e: any) { results.link_result = { error: e.message }; }

      // Also try linking via BM
      try {
        const bmLinkResp = await fetch(`https://graph.facebook.com/v26.0/${BM_ID}/owned_instagram_accounts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: longLivedToken,
            instagram_account_id: IG_ID
          }),
        });
        results.bm_link_result = await bmLinkResp.json();
      } catch (e: any) { results.bm_link_result = { error: e.message }; }

      // Check page after link attempt
      const checkResp = await fetch(`https://graph.facebook.com/v26.0/${PAGE_ID}?fields=id,name,instagram_business_account{id,username},connected_instagram_account{id,username}&access_token=${encodeURIComponent(longLivedToken)}`);
      results.page_after_link = await checkResp.json();

      // If link succeeded, store the IG link in webhook subscription
      if (results.link_result?.success || results.bm_link_result?.success) {
        // Store the user token for future use
        const account = await prisma.instagramAccount.findFirst({ orderBy: { connectedAt: "desc" } });
        if (account) {
          await prisma.instagramAccount.update({
            where: { id: account.id },
            data: {
              pageToken: encryptToken(longLivedToken)
            }
          });
          results.stored = "✅ User token stored for future BM operations";
        }
      }
    }

    return json(results);
  } catch (e: any) {
    return json({ error: e.message });
  }
}

function html() {
  return `<!doctype html>
<html><head><title>IG↔FB Link Tool</title>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>body{font-family:-apple-system,sans-serif;max-width:640px;margin:40px auto;padding:0 20px;line-height:1.5}
h2{color:#1a1a1a}input,button{padding:8px 12px;font-size:14px;border-radius:6px;border:1px solid #ccc;width:100%;box-sizing:border-box;margin:6px 0}
button{background:#1877F2;color:white;border:none;cursor:pointer}
button:hover{background:#166fe5}.step{margin:20px 0;padding:16px;background:#f5f6f8;border-radius:8px}
code{background:#eee;padding:2px 6px;border-radius:3px;font-size:13px}
</style></head><body>
<h2>🔗 Link Instagram → Facebook Page</h2>
<p>This tool links @stoiczodiac to the Stoic Zodiac page using your user token.</p>
<div class="step">
<strong>Step 1:</strong> Get a User Token from <a href="https://developers.facebook.com/tools/explorer/${APP_ID}/" target="_blank">Graph API Explorer</a><br>
<small>Add: <code>pages_manage_metadata</code>, <code>business_management</code>, <code>instagram_manage_comments</code>, <code>pages_read_engagement</code></small>
</div>
<div class="step">
<strong>Step 2:</strong> Paste token and choose action:
<form method="get">
<input type="text" name="token" placeholder="Paste EAA... token here" style="font-family:monospace">
<button type="submit" name="action" value="link">🔗 Link IG to Page</button>
<button type="submit" name="action" value="scope-check" style="background:#666">🔍 Just Check Scopes</button>
</form>
</div>
<div class="step">
<strong>Or try the simple fix:</strong><br>
<small>Go to <a href="https://business.facebook.com/settings/business-users" target="_blank">Business Settings → Business Users</a><br>
→ Add @stoiczodiac to BM "marc jelen" → Link to page from there</small>
</div>
</body></html>`;
}

function json(d: unknown) {
  return new Response(JSON.stringify(d, null, 2), {
    headers: { "content-type": "application/json" }
  });
}