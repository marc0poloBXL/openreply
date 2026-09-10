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

  async function probe(label: string, url: string) {
    try {
      const r = await fetch(url);
      log[label] = await r.json();
    } catch (e: any) { log[label] = { error: e.message }; }
  }

  // 1. Who does the page belong to? Check page owner / business
  if (pageToken) {
    await probe("page_business", `https://graph.facebook.com/v26.0/${PAGE_ID}?fields=id,name,business&access_token=${encodeURIComponent(pageToken)}`);
    await probe("page_ig_accounts", `https://graph.facebook.com/v26.0/${PAGE_ID}/instagram_accounts?access_token=${encodeURIComponent(pageToken)}`);
  }

  // 2. Check all BMs
  for (const bm of ["2052016095704629", "5180791675279566", "9824014651061253"]) {
    await probe(`bm_${bm}_info`, `https://graph.facebook.com/v26.0/${bm}?fields=id,name&access_token=${encodeURIComponent(pageToken || "")}`);
  }

  // 3. Try to find the IG account via Business Discovery
  if (pageToken) {
    await probe("ig_metadata", `https://graph.facebook.com/v26.0/${IG_ID}?fields=id,username,name,business_discovery.username('stoiczodiac'){id,username,name,followers_count}&access_token=${encodeURIComponent(pageToken)}`);
  }

  // 4. Try to read IG account profile via PAGE token on graph.facebook.com
  if (pageToken) {
    // The 'business_discovery' endpoint might show us the IG account from the page's perspective
    await probe("page_discovery", `https://graph.facebook.com/v26.0/${PAGE_ID}?fields=business_discovery.username('stoiczodiac'){id,username,name,media_count,followers_count}&access_token=${encodeURIComponent(pageToken)}`);
  }

  // 5. Check if the old page ID now has the IG link
  const pageIds = ["1229304876940609", "61594011424463"];
  const fieldStr = "id,name,instagram_business_account{id,username},connected_instagram_account{id,username}";
  for (const pid of pageIds) {
    if (pageToken) {
      await probe(`page_${pid}_fields`, `https://graph.facebook.com/v26.0/${pid}?fields=${fieldStr}&access_token=${encodeURIComponent(pageToken)}`);
    }
  }

  // 6. What IG accounts are in the various BMs?
  if (pageToken) {
    for (const bm of ["2052016095704629", "5180791675279566"]) {
      await probe(`bm_${bm}_ig_accounts`, `https://graph.facebook.com/v26.0/${bm}/owned_instagram_accounts?fields=id,username,name&access_token=${encodeURIComponent(pageToken)}`);
    }
  }

  // 7. Check connected apps for this IG
  if (igaaToken) {
    await probe("ig_connected_apps", `https://graph.instagram.com/v25.0/${IG_ID}?fields=id,username,account_type,ig_is_business,connected_to_app&access_token=${encodeURIComponent(igaaToken)}`);
  }

  return json(log);
}

function json(d: unknown) {
  return new Response(JSON.stringify(d, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}