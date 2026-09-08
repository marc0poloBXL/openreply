import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";

const IG_ID = "17841438935909153";  // @stoiczodiac
const PAGE_ID = "61594011424463";   // Stoic Zodiac Facebook Page
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

  const results: Record<string, unknown> = {
    instagramId: account.instagramId,
    username: account.username,
    hasPageToken: !!pageToken,
    hasIgaaToken: !!igaaToken,
    steps: {} as Record<string, unknown>,
  };

  // Step 1: Debug token scopes
  if (pageToken) {
    const debugRes = await fetch(
      `https://graph.facebook.com/${API_VERSION}/debug_token?input_token=${encodeURIComponent(pageToken)}&access_token=${appToken}`
    );
    const debug = await debugRes.json();
    results.steps["1_token_debug"] = {
      valid: debug.data?.is_valid,
      scopes: debug.data?.scopes,
      expiresAt: debug.data?.expires_at ? new Date(debug.data.expires_at * 1000).toISOString() : null,
    };
  }

  // Step 2: POST /{ig-id}/owner
  if (pageToken) {
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${IG_ID}/owner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: pageToken, page_id: PAGE_ID }),
    });
    results.steps["2_owner"] = await res.json();
  }

  // Step 3: POST /{page-id}/instagram_accounts
  if (pageToken) {
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${PAGE_ID}/instagram_accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: pageToken, instagram_account_id: IG_ID }),
    });
    results.steps["3_instagram_accounts"] = await res.json();
  }

  // Step 4: Verify — check page for linked IG
  if (pageToken) {
    const checkRes = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PAGE_ID}?fields=name,instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`
    );
    results.steps["4_verify"] = await checkRes.json();
  }

  return NextResponse.json(results);
}