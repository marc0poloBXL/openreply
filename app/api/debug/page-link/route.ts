import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";

const IG_ID = "17841438935909153";
const PAGE_ID = "1229304876940609";
const PAGE_ID_OLD = "61594011424463";
const APP_TOKEN = "1051360407668084|b2708ce0c790783fbf27c0dfcc0e1459";

export async function GET() {
  const account = await prisma.instagramAccount.findFirst({ orderBy: { connectedAt: "desc" } });
  if (!account?.pageToken) {
    return json({ error: "No page token stored" });
  }

  const pageToken = decryptToken(account.pageToken);
  const igaaToken = account.accessToken ? decryptToken(account.accessToken) : null;
  const results: Record<string, unknown> = {};

  async function probe(label: string, url: string) {
    try {
      const r = await fetch(url);
      results[label] = await r.json();
    } catch (e: any) {
      results[label] = { error: e.message };
    }
  }

  // 1. Current page — probe with clean fields
  await probe("1_page",
    `https://graph.facebook.com/v26.0/${PAGE_ID}?fields=id,name,about,category,connected_instagram_account{id,username},instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`
  );

  // 2. Same page with IGAA token (if we have it)
  if (igaaToken) {
    await probe("2_page_via_igaa",
      `https://graph.facebook.com/v26.0/${PAGE_ID}?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(igaaToken)}`
    );
  }

  // 3. Same page with app token
  await probe("3_page_via_app",
    `https://graph.facebook.com/v26.0/${PAGE_ID}?fields=id,name,instagram_business_account{id,username}&access_token=${APP_TOKEN}`
  );

  // 4. Token /me
  await probe("4_token_owner",
    `https://graph.facebook.com/v26.0/me?fields=id,name&access_token=${encodeURIComponent(pageToken)}`
  );

  // 5. Old page
  await probe("5_old_page",
    `https://graph.facebook.com/v26.0/${PAGE_ID_OLD}?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`
  );

  // 6. IG account via app token (tries to find which page it's linked to)
  await probe("6_ig_via_app",
    `https://graph.facebook.com/v26.0/${IG_ID}?fields=id,username,profile_picture_url&access_token=${APP_TOKEN}`
  );

  // 7. IG account via IGAA on graph.instagram.com
  if (igaaToken) {
    await probe("7_ig_via_igaa",
      `https://graph.instagram.com/v25.0/me?fields=id,username,name,account_type&access_token=${encodeURIComponent(igaaToken)}`
    );
  }

  // 8. Look up IG via Instagram Business Discovery on the page
  // This field is available on pages with IG connected
  await probe("8_discovery",
    `https://graph.facebook.com/v26.0/${PAGE_ID}?fields=id,name,instagram_accounts{id,username}&access_token=${encodeURIComponent(pageToken)}`
  );

  // 9. Page token permissions — does it have pages_manage_metadata?
  await probe("9_permissions",
    `https://graph.facebook.com/v26.0/me/permissions?access_token=${encodeURIComponent(pageToken)}`
  );

  return json(results);
}

function json(data: unknown) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}