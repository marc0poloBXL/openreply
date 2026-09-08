import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { decryptToken, encryptToken } from "@/lib/meta/oauth";

const IG_ID = "17841438935909153";  // @stoiczodiac
const API_VERSION = process.env.META_GRAPH_API_VERSION || "v26.0";
const APP_ID = process.env.FACEBOOK_APP_ID || "";
const REDIRECT_URI = "https://openreply-zeta-ruby.vercel.app/api/ig-link/callback";

export async function GET() {
  const account = await prisma.instagramAccount.findFirst({
    orderBy: { connectedAt: "desc" },
  });

  if (!account) {
    return NextResponse.json({ error: "No Instagram account found" }, { status: 404 });
  }

  const pageToken = account.pageToken ? decryptToken(account.pageToken) : null;
  const appToken = `${APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;

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

  // Step 3: Check if page has linked IG
  if (pageToken && pageId) {
    const pageRes = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${pageId}?fields=name,instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`
    );
    const pageData = (await pageRes.json()) as Record<string, unknown>;
    if (pageData.instagram_business_account) {
      const ig = pageData.instagram_business_account as Record<string, unknown>;
      pageData.note = `✅ Page already linked to IG: @${ig.username} (${ig.id})`;
      if (String(ig.id) === IG_ID) {
        pageData.note += " — THIS IS OUR IG! Link is working!";
      }
    } else {
      pageData.note = "❌ Page has no linked IG account yet";
    }
    steps["3_page_info"] = pageData;
  }

  // Step 4: Generate login URL for the user to authorize page management
  const state = Buffer.from(JSON.stringify({ pageId, igId: IG_ID, ts: Date.now() })).toString("base64url");
  const loginUrl = `https://www.facebook.com/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}&scope=pages_manage_metadata,pages_read_engagement,pages_show_list&response_type=code`;

  steps["4_action_required"] = {
    message: "The page token stored in DB can't modify the page. Visit the URL below to grant page management permissions.",
    login_url: loginUrl,
  };

  return NextResponse.json({
    instagramId: IG_ID,
    username: account.username,
    hasPageToken: !!pageToken,
    discoveredPageId,
    pageName: "Stoic Zodiac",
    steps,
  });
}

// Handle the OAuth callback
export async function POST(request: Request) {
  const body = (await request.json()) as { code?: string; state?: string };

  if (!body.code) {
    return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
  }

  // Exchange code for short-lived user token
  const tokenRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_secret=${process.env.FACEBOOK_APP_SECRET}&code=${body.code}`,
    { method: "GET" }
  );
  const tokenData = (await tokenRes.json()) as Record<string, unknown>;

  if (tokenData.error) {
    return NextResponse.json(
      { error: "Token exchange failed", details: tokenData.error },
      { status: 400 }
    );
  }

  const shortLivedToken = String(tokenData.access_token || "");

  // Exchange for long-lived (60-day) token
  const longRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${process.env.FACEBOOK_APP_SECRET}&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`,
    { method: "GET" }
  );
  const longData = (await longRes.json()) as Record<string, unknown>;

  if (longData.error) {
    return NextResponse.json(
      { error: "Long-lived exchange failed", details: longData.error },
      { status: 400 }
    );
  }

  const userToken = String(longData.access_token || shortLivedToken);
  const state = body.state
    ? JSON.parse(Buffer.from(body.state, "base64url").toString())
    : null;
  const pageId = state?.pageId || "1229304876940609";

  type StepEntry = Record<string, unknown>;
  const linkingSteps: StepEntry = {};
  let linked = false;

  // Now try to link: POST /{page-id}/instagram_accounts with user token
  const linkRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${pageId}/instagram_accounts`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: userToken, instagram_account_id: IG_ID }),
    }
  );
  const linkData = (await linkRes.json()) as StepEntry;
  const linkErr = linkData.error as StepEntry | undefined;
  if (linkData.success || linkData.id) {
    linked = true;
  } else if (linkErr && linkErr.code === 100 && linkErr.error_subcode === 33) {
    linkData.note =
      "⚠️ Page exists but token may not have admin access. Try the manual approach below.";
  }
  linkingSteps["1_link"] = linkData;

  // Verify
  const verifyRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${pageId}?fields=name,instagram_business_account{id,username}&access_token=${encodeURIComponent(userToken)}`
  );
  const verifyData = (await verifyRes.json()) as StepEntry;
  const igBiz = verifyData.instagram_business_account as StepEntry | undefined;
  if (igBiz && String(igBiz.id) === IG_ID) {
    verifyData.note = "✅ SUCCESS! @stoiczodiac is linked!";
    linked = true;
  }
  linkingSteps["2_verify"] = verifyData;

  // If still not linked, provide manual Account Center path
  if (!linked) {
    linkingSteps["3_manual_path"] = {
      message:
        "API linking didn't work. Do this manually in your browser:",
      steps: [
        "1. Go to https://www.facebook.com/stoiczodiac — your Facebook Page",
        "2. Click 'Settings' at the top",
        "3. In the left menu, click 'Linked Accounts' (or 'Instagram' under Business Tools)",
        "4. Click 'Connect' or 'Link Account' next to Instagram",
        "5. Log into @stoiczodiac when prompted",
      ],
      alternative: "Or in Account Center:",
      accountCenterSteps: [
        "1. Go to https://www.facebook.com/settings?tab=account_center",
        "2. Click 'Accounts' → 'Add accounts' → 'Add Instagram account'",
        "3. Log into @stoiczodiac",
        "4. Then go back to Account Center → 'Profiles' → 'Coupled profiles'",
        "5. Add the Stoic Zodiac page and @stoiczodiac together",
      ],
    };
  }

  // Store the new user token
  const encrypted = encryptToken(userToken);
  const existingAccount = await prisma.instagramAccount.findFirst({
    orderBy: { connectedAt: "desc" },
  });
  if (existingAccount) {
    await prisma.instagramAccount.update({
      where: { id: existingAccount.id },
      data: { pageToken: encrypted },
    });
  }

  return NextResponse.json({
    linked,
    pageId,
    igId: IG_ID,
    tokenExchanged: true,
    linkingSteps,
  });
}