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
  const log: Record<string, unknown> = {};

  async function postProbe(label: string, url: string, body: Record<string, unknown>) {
    try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); log[label] = await r.json(); }
    catch (e: any) { log[label] = { error: e.message }; }
  }

  // Try link with IGAA token on graph.instagram.com
  if (igaaToken) {
    await postProbe("link_via_igaa_igcom", `https://graph.instagram.com/v25.0/${IG_ID}/assigned_pages`, {
      access_token: igaaToken, page_id: PAGE_ID,
    });
  }

  // Try with page token via query params (PUT-style)
  if (pageToken) {
    try {
      const r = await fetch(`https://graph.facebook.com/v26.0/${PAGE_ID}/instagram_accounts?access_token=${encodeURIComponent(pageToken)}&instagram_account_id=${IG_ID}`, { method: "POST" });
      log.link_via_queryparams = await r.json();
    } catch (e: any) { log.link_via_queryparams = { error: e.message }; }
  }

  // Try BM link with page token
  if (pageToken) {
    await postProbe("link_bm_with_page", `https://graph.facebook.com/v26.0/2052016095704629/owned_instagram_accounts`, {
      access_token: pageToken, instagram_account_id: IG_ID,
    });
  }

  // Final: check page with ALL IG fields
  if (pageToken) {
    try {
      const r = await fetch(`https://graph.facebook.com/v26.0/${PAGE_ID}?fields=id,name,instagram_business_account{id,username},connected_instagram_account{id,username},instagram_accounts{id,username}&access_token=${encodeURIComponent(pageToken)}`);
      log.final_page_check = await r.json();
    } catch (e: any) { log.final_page_check = { error: e.message }; }
  }

  // Check BM IG accounts
  if (pageToken) {
    for (const bm of ["2052016095704629"]) {
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