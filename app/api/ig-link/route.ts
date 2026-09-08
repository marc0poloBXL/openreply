import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";

const IG_ID = "17841438935909153";  // @stoiczodiac
const API_VERSION = process.env.META_GRAPH_API_VERSION || "v26.0";

export async function GET() {
  const account = await prisma.instagramAccount.findFirst({
    orderBy: { connectedAt: "desc" },
  });

  if (!account) {
    return NextResponse.json({ error: "No Instagram account found" }, { status: 404 });
  }

  const pageToken = account.pageToken ? decryptToken(account.pageToken) : null;
  const igaaToken = account.accessToken ? decryptToken(account.accessToken) : null;
  const appToken = `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;

  const steps: Record<string, unknown> = {};
  let discoveredPageId: string | null = null;

  // Step 1: Debug token scopes
  if (pageToken) {
    const debugRes = await fetch(
      `https://graph.facebook.com/${API_VERSION}/debug_token?input_token=${encodeURIComponent(pageToken)}&access_token=${appToken}`
    );
    const debug = await debugRes.json();
    steps["1_token_debug"] = {
      valid: debug.data?.is_valid,
      scopes: debug.data?.scopes,
      appId: debug.data?.app_id,
      type: debug.data?.type,
      profileId: debug.data?.profile_id,
      userId: debug.data?.user_id,
      expiresAt: debug.data?.expires_at ? new Date(debug.data.expires_at * 1000).toISOString() : null,
    };
  }

  // Step 2: Discover page identity via token's /me
  if (pageToken) {
    const meRes = await fetch(
      `https://graph.facebook.com/${API_VERSION}/me?fields=id,name&access_token=${encodeURIComponent(pageToken)}`
    );
    const me = (await meRes.json()) as Record<string, unknown>;
    if (me.id) {
      discoveredPageId = String(me.id);
      me.note = `This token is for page "${me.name}" (ID: ${me.id})`;
    }
    steps["2_token_me"] = me;
  }

  const pageId = discoveredPageId;

  // Step 3: Check IG account info on graph.facebook.com (via page token)
  if (pageToken && pageId) {
    const pageRes = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${pageId}?fields=name,instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`
    );
    const pageData = (await pageRes.json()) as Record<string, unknown>;
    if (pageData.instagram_business_account) {
      pageData.note = `✅ Page already linked to IG: @${(pageData.instagram_business_account as Record<string, unknown>).username}`;
    } else {
      pageData.note = "❌ Page has no linked IG account yet — attempting to link...";
    }
    steps["3_page_info"] = pageData;
  }

  // Step 4: Try POST /{ig-id}/owner (link IG to page via IG account)
  if (pageToken && pageId) {
    const ownerRes = await fetch(`https://graph.facebook.com/${API_VERSION}/${IG_ID}/owner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: pageToken, page_id: pageId }),
    });
    steps["4_owner"] = await ownerRes.json();
  }

  // Step 5: Try POST /{page-id}/instagram_accounts (link via page)
  if (pageToken && pageId) {
    const linkRes = await fetch(`https://graph.facebook.com/${API_VERSION}/${pageId}/instagram_accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: pageToken, instagram_account_id: IG_ID }),
    });
    steps["5_instagram_accounts"] = await linkRes.json();
  }

  // Step 6: Verify the link
  if (pageToken && pageId) {
    const verifyRes = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${pageId}?fields=name,instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`
    );
    const verifyData = (await verifyRes.json()) as Record<string, unknown>;
    if ((verifyData.instagram_business_account as Record<string, unknown>)?.id === IG_ID) {
      verifyData.note = "✅ SUCCESS: @stoiczodiac is now linked to the Facebook page!";
    }
    steps["6_verify"] = verifyData;
  }

  return NextResponse.json({
    instagramId: IG_ID,
    username: account.username,
    hasPageToken: !!pageToken,
    discoveredPageId,
    steps,
  });
}