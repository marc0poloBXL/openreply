import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";

const IG_ID = "17841438935909153";
const PAGE_ID = "1229304876940609";
const APP_ID = "1051360407668084";

export const maxDuration = 60;

export async function GET() {
  const account = await prisma.instagramAccount.findFirst({ orderBy: { connectedAt: "desc" } });
  if (!account) return json({ error: "No account" });
  const pageToken = account.pageToken ? decryptToken(account.pageToken) : null;
  const igaaToken = account.accessToken ? decryptToken(account.accessToken) : null;
  const appSecret = process.env.FACEBOOK_APP_SECRET || "";
  const appToken = appSecret ? `${APP_ID}|${appSecret}` : null;
  const log: Record<string, unknown> = {};

  async function probe(label: string, url: string) {
    try {
      const r = await fetch(url);
      log[label] = await r.json();
    } catch (e: any) { log[label] = { error: e.message }; }
  }

  async function postProbe(label: string, url: string, body: Record<string, unknown>) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      log[label] = await r.json();
    } catch (e: any) { log[label] = { error: e.message }; }
  }

  if (pageToken) {
    await probe("page_business", `https://graph.facebook.com/v26.0/${PAGE_ID}?fields=id,name,business&access_token=${encodeURIComponent(pageToken)}`);
    await probe("page_ig_accounts", `https://graph.facebook.com/v26.0/${PAGE_ID}/instagram_accounts?access_token=${encodeURIComponent(pageToken)}`);
  }

  for (const bm of ["2052016095704629", "5180791675279566", "9824014651061253"]) {
    await probe(`bm_${bm}_info`, `https://graph.facebook.com/v26.0/${bm}?fields=id,name&access_token=${encodeURIComponent(pageToken || "")}`);
  }

  if (pageToken) {
    await probe("ig_metadata", `https://graph.facebook.com/v26.0/${IG_ID}?fields=id,username,name&access_token=${encodeURIComponent(pageToken)}`);
    await probe("page_discovery", `https://graph.facebook.com/v26.0/${PAGE_ID}?fields=business_discovery.username('stoiczodiac'){id,username,name,media_count,followers_count}&access_token=${encodeURIComponent(pageToken)}`);
  }

  const pageIds = ["1229304876940609", "61594011424463"];
  const fieldStr = "id,name,instagram_business_account{id,username},connected_instagram_account{id,username}";
  for (const pid of pageIds) {
    if (pageToken) {
      await probe(`page_${pid}_fields`, `https://graph.facebook.com/v26.0/${pid}?fields=${fieldStr}&access_token=${encodeURIComponent(pageToken)}`);
    }
  }

  if (pageToken) {
    for (const bm of ["2052016095704629", "5180791675279566"]) {
      await probe(`bm_${bm}_ig_accounts`, `https://graph.facebook.com/v26.0/${bm}/owned_instagram_accounts?fields=id,username,name&access_token=${encodeURIComponent(pageToken)}`);
    }
  }

  // Try LINKING via app token
  if (appToken) {
    await postProbe("link_page_ig_via_app", `https://graph.facebook.com/v26.0/${PAGE_ID}/instagram_accounts`, {
      access_token: appToken,
      instagram_account_id: IG_ID,
    });
    await postProbe("link_bm_ig_via_app", `https://graph.facebook.com/v26.0/2052016095704629/owned_instagram_accounts`, {
      access_token: appToken,
      instagram_account_id: IG_ID,
    });
    await postProbe("link_ig_page_via_app", `https://graph.facebook.com/v26.0/${IG_ID}/assigned_pages`, {
      access_token: appToken,
      page_id: PAGE_ID,
    });
  }

  if (igaaToken) {
    await probe("ig_connected_apps", `https://graph.instagram.com/v25.0/${IG_ID}?fields=id,username,account_type&access_token=${encodeURIComponent(igaaToken)}`);
  }

  return json(log);
}

function json(d: unknown) {
  return new Response(JSON.stringify(d, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}