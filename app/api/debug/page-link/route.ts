import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";

const IG_ID = "17841438935909153";
const PAGE_ID = "1229304876940609";
const PAGE_ID_OLD = "61594011424463";
const BMS = ["2052016095704629", "5180791675279566"];

export async function GET() {
  const account = await prisma.instagramAccount.findFirst({ orderBy: { connectedAt: "desc" } });
  if (!account?.pageToken) {
    return json({ error: "No page token stored" });
  }

  const pageToken = decryptToken(account.pageToken);
  const results: Record<string, unknown> = {};

  async function probe(label: string, url: string) {
    try {
      const r = await fetch(url);
      results[label] = await r.json();
    } catch (e: any) {
      results[label] = { error: e.message };
    }
  }

  // 1. Current page — do we have instagram_business_account?
  await probe("current_page",
    `https://graph.facebook.com/v26.0/${PAGE_ID}?fields=id,name,about,category,tasks,connected_instagram_account{id,username},instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`
  );

  // 2. All pages this token manages
  await probe("me_accounts",
    `https://graph.facebook.com/v26.0/me/accounts?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`
  );

  // 3. Token owner
  await probe("token_owner",
    `https://graph.facebook.com/v26.0/me?fields=id,name&access_token=${encodeURIComponent(pageToken)}`
  );

  // 4. Old page
  await probe("old_page",
    `https://graph.facebook.com/v26.0/${PAGE_ID_OLD}?fields=id,name&access_token=${encodeURIComponent(pageToken)}`
  );

  // 5. Try the IG account directly
  await probe("ig_account",
    `https://graph.facebook.com/v26.0/${IG_ID}?fields=id,username&access_token=${encodeURIComponent(pageToken)}`
  );

  // 6. Check if IG is directly accessible as a page (it sometimes is for linked accounts)
  await probe("ig_as_page",
    `https://graph.facebook.com/v26.com/${IG_ID}?fields=id,username,name&access_token=${encodeURIComponent(pageToken)}`
  );

  return json(results);
}

function json(data: unknown) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}