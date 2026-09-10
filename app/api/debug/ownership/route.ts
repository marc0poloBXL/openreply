import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";

const IG_ID = "17841438935909153";
const PAGE_ID = "1229304876940609";

export const maxDuration = 60;

export async function GET() {
  const account = await prisma.instagramAccount.findFirst({ orderBy: { connectedAt: "desc" } });
  if (!account) return json({ error: "No account" });
  const pageToken = account.pageToken ? decryptToken(account.pageToken) : null;
  const igaaToken = account.accessToken ? decryptToken(account.accessToken) : null;
  const appToken = `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;
  const log: Record<string, unknown> = {};

  async function postProbe(label: string, url: string, body: Record<string, unknown>) {
    try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); log[label] = await r.json(); }
    catch (e: any) { log[label] = { error: e.message }; }
  }

  // === 1. Debug the page token — what scopes does it really have? ===
  if (pageToken && appToken) {
    try {
      const r = await fetch(`https://graph.facebook.com/v26.0/debug_token?input_token=${encodeURIComponent(pageToken)}&access_token=${encodeURIComponent(appToken)}`);
      log.token_debug = await r.json();
    } catch (e: any) { log.token_debug = { error: e.message }; }
  }

  // === 2. Debug the app token too ===
  try {
    const r = await fetch(`https://graph.facebook.com/v26.0/debug_token?input_token=${encodeURIComponent(appToken)}&access_token=${encodeURIComponent(appToken)}`);
    log.app_token_debug = await r.json();
  } catch (e: any) { log.app_token_debug = { error: e.message }; }

  // === 3. Link: POST body fields (not query params) with page token ===
  if (pageToken) {
    await postProbe("link_via_json_body", `https://graph.facebook.com/v26.0/${PAGE_ID}/instagram_accounts`, {
      access_token: pageToken,
      instagram_account_id: IG_ID,
    });
  }

  // === 4. Link: also try with app token (needs pages_manage_metadata but let's see) ===
  await postProbe("link_via_app_token", `https://graph.facebook.com/v26.0/${PAGE_ID}/instagram_accounts`, {
    access_token: appToken,
    instagram_account_id: IG_ID,
  });

  // === 5. Check page with page token + ALL known IG fields ===
  if (pageToken) {
    try {
      const r = await fetch(`https://graph.facebook.com/v26.0/${PAGE_ID}?fields=id,name,about,category,instagram_business_account{id,username,profile_pic},connected_instagram_account{id,username},instagram_accounts{id,username}&access_token=${encodeURIComponent(pageToken)}`);
      log.page_ig_fields = await r.json();
    } catch (e: any) { log.page_ig_fields = { error: e.message }; }
  }

  // === 6. Try link with IGAA token on graph.instagram.com ===
  if (igaaToken) {
    await postProbe("link_via_igaa_igcom", `https://graph.instagram.com/v25.0/${IG_ID}/assigned_pages`, {
      access_token: igaaToken, page_id: PAGE_ID,
    });
  }

  // === 7. Final: check BM IG accounts ===
  if (pageToken) {
    for (const bm of ["2052016095704629", "5180791675279566", "9824014651061253"]) {
      try {
        const r = await fetch(`https://graph.facebook.com/v26.0/${bm}/owned_instagram_accounts?fields=id,username,name&access_token=${encodeURIComponent(pageToken)}`);
        log[`bm_${bm}_owned`] = await r.json();
      } catch (e: any) { log[`bm_${bm}_owned`] = { error: e.message }; }
    }
  }

  return json(log);
}

function json(d: unknown) {
  return new Response(JSON.stringify(d, null, 2), { headers: { "Content-Type": "application/json" } });
}