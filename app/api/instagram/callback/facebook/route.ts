import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { subscribeInstagramAccountToWebhooks } from "@/lib/meta/client";
import {
  encryptToken,
  exchangeFbCodeForToken,
  exchangeFbLongLivedToken,
  verifyOAuthState,
} from "@/lib/meta/oauth";
import { canManageWorkspace } from "@/lib/workspace-access";

const IG_ID = "17841438935909153";
const IG_ACCOUNT_DB_ID = "cmtocgan5000004kzet71p0ka";

/**
 * Facebook Login callback — supports both session-based and simple-fix flows.
 *
 * Simple-fix flow (state="simple_fix"): No session required. After getting the token,
 * creates a new Facebook Page with a business-compatible category, links
 * @stoiczodiac to it, and stores everything.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const errorParam = request.nextUrl.searchParams.get("error");
  const rawState = request.nextUrl.searchParams.get("state");
  const baseUrl = getBaseUrl();

  if (errorParam) {
    return NextResponse.redirect(`${baseUrl}/api/fb-fix?error=denied`);
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/api/fb-fix?error=invalid`);
  }

  // Determine if this is the simple-fix flow
  const isSimpleFix = rawState === "simple_fix" || rawState === "simple_fix_create_page";

  try {
    const redirectUri = `${baseUrl}/api/instagram/callback/facebook`;

    // Step 1: Exchange Facebook auth code for a short-lived FB user token
    const { accessToken: shortLivedToken } = await exchangeFbCodeForToken(
      code,
      redirectUri
    );

    // Step 2: Exchange for a long-lived FB user token (60 days)
    const { accessToken: longLivedFbToken } =
      await exchangeFbLongLivedToken(shortLivedToken);

    if (isSimpleFix) {
      // --- SIMPLE FIX FLOW (no session required) ---
      // Step 3: Get user info
      const meResp = await fetch(
        `https://graph.facebook.com/v26.0/me?fields=id,name&access_token=${encodeURIComponent(longLivedFbToken)}`
      );
      const meData = await meResp.json();
      const userId = meData.id;

      // Step 4: Try to find a compatible category
      // First check what categories the user can create pages with
      // Use a known-good business category: "Brand" or "Website"
      const categoryId = "1902"; // Website category ID

      // Step 5: Check if we already have a "Stoic Zodiac" page that's NOT Personal blog
      const existingResp = await fetch(
        `https://graph.facebook.com/v26.0/${userId}/accounts?fields=id,name,category&access_token=${encodeURIComponent(longLivedFbToken)}`
      );
      const existingData = await existingResp.json();
      let existingPage = null;
      if (existingData?.data) {
        for (const p of existingData.data) {
          if (p.name?.toLowerCase().includes("stoic") && p.category !== "Personal blog") {
            existingPage = p;
            break;
          }
        }
      }

      if (existingPage) {
        // Use existing compatible page
        const pageResp = await fetch(
          `https://graph.facebook.com/v26.0/${existingPage.id}?fields=id,name,access_token,category&access_token=${encodeURIComponent(longLivedFbToken)}`
        );
        const pageData = await pageResp.json();
        const pageToken = pageData.access_token;

        // Link IG to this page
        const linkResp = await fetch(
          `https://graph.facebook.com/v26.0/${existingPage.id}/instagram_accounts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: pageToken, instagram_account_id: IG_ID }),
          }
        );
        const linkData = await linkResp.json();

        // Store the page token
        const encrypted = encryptToken(pageToken);
        await prisma.instagramAccount.update({
          where: { id: IG_ACCOUNT_DB_ID },
          data: { pageToken: encrypted, tokenExpiresAt: new Date(Date.now() + 55 * 24 * 60 * 60 * 1000) },
        });

        return NextResponse.redirect(
          `${baseUrl}/api/fb-fix?result=linked&link=${linkData.success ? "ok" : "fail"}`
        );
      }

      // Step 6: Create a new page with a compatible business category
      // Try several category names
      const categories = ["Brand", "Website", "App Page"];
      let createdPage = null;

      for (const cat of categories) {
        const createResp = await fetch(
          `https://graph.facebook.com/v26.0/${userId}/accounts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              name: "Stoic Zodiac",
              category: cat,
              access_token: longLivedFbToken,
            }).toString(),
          }
        );
        const createData = await createResp.json();
        if (createData.id) {
          createdPage = { id: createData.id, name: cat };
          break;
        }
      }

      if (!createdPage) {
        return NextResponse.redirect(
          `${baseUrl}/api/fb-fix?error=could_not_create_page`
        );
      }

      // Step 7: Get the new page's access token
      const newPageResp = await fetch(
        `https://graph.facebook.com/v26.0/${createdPage.id}?fields=id,name,access_token,category&access_token=${encodeURIComponent(longLivedFbToken)}`
      );
      const newPageData = await newPageResp.json();
      const pageToken = newPageData.access_token;

      // Step 8: Link @stoiczodiac to the new page
      const linkResp2 = await fetch(
        `https://graph.facebook.com/v26.0/${createdPage.id}/instagram_accounts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: pageToken, instagram_account_id: IG_ID }),
        }
      );
      const linkData2 = await linkResp2.json();
      const linkResult = linkData2.success ? "ok" : (linkData2.error?.message || "fail");

      // Step 9: Subscribe webhooks
      let subscribed = false;
      try {
        const sub = await fetch(
          `https://graph.facebook.com/v26.0/${IG_ID}/subscribed_apps`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: pageToken, subscribed_fields: "comments,messages" }),
          }
        );
        const subData = await sub.json();
        subscribed = Boolean(subData.success);
      } catch {}

      // Step 10: Store the new page token
      const encrypted = encryptToken(pageToken);
      await prisma.instagramAccount.update({
        where: { id: IG_ACCOUNT_DB_ID },
        data: { pageToken: encrypted, tokenExpiresAt: new Date(Date.now() + 55 * 24 * 60 * 60 * 1000), webhookSubscribed: subscribed },
      });

      return NextResponse.redirect(
        `${baseUrl}/api/fb-fix?result=done&page=${createdPage.name}&link=${typeof linkResult === "string" ? linkResult.substring(0, 100) : "tried"}&subscribed=${subscribed}`
      );

    } else {
      // --- STANDARD FLOW (session required) ---
      const session = await auth();
      if (!session?.user?.id) {
        return NextResponse.redirect(`${baseUrl}/login`);
      }

      const state = verifyOAuthState(rawState);
      if (!state) {
        return NextResponse.redirect(`${baseUrl}/settings?facebook=invalid_state`);
      }

      const membership = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId: state.workspaceId,
          userId: session.user.id,
        },
      });

      if (!membership || !canManageWorkspace(membership.role)) {
        return NextResponse.redirect(`${baseUrl}/settings?facebook=forbidden`);
      }

      // Step 3: Get the pages linked to the user
      const version = process.env.META_GRAPH_API_VERSION ?? "v26.0";
      const accountsUrl = new URL(
        `https://graph.facebook.com/${version}/me/accounts`
      );
      accountsUrl.searchParams.set(
        "fields",
        "id,name,access_token,instagram_business_account{id,username,name}"
      );
      accountsUrl.searchParams.set("access_token", longLivedFbToken);
      const accountsResp = await fetch(accountsUrl.toString());
      const accountsData = (await accountsResp.json()) as {
        data?: Array<{
          id: string;
          name: string;
          access_token: string;
          instagram_business_account?: {
            id: string;
            username: string;
            name: string;
          };
        }>;
      };

      if (!accountsData.data || accountsData.data.length === 0) {
        throw new Error("No Facebook pages found for this user");
      }

      // Find the Page linked to the Instagram account
      const igAccount = await prisma.instagramAccount.findFirst({
        where: { workspaceId: state.workspaceId },
        orderBy: { connectedAt: "desc" },
      });

      if (!igAccount) {
        throw new Error(
          "No Instagram account found. Connect Instagram first, then link your Facebook Page."
        );
      }

      // Try to find a page whose IG business account matches ours
      let matchedPage = accountsData.data.find(
        (p) => p.instagram_business_account?.id === igAccount.instagramId
      );

      // If no exact match, take the first page with an IG business account
      if (!matchedPage) {
        matchedPage = accountsData.data.find(
          (p) => p.instagram_business_account
        );
      }

      if (!matchedPage || !matchedPage.instagram_business_account) {
        throw new Error(
          "Your Instagram Business account must be linked to a Facebook Page. " +
            "Go to Instagram Settings → Account → Linked Accounts → Facebook to connect it."
        );
      }

      const pageToken = matchedPage.access_token;

      // Encrypt and store the Page token alongside the existing IGAA token
      const encryptedPageToken = encryptToken(pageToken);
      const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

      // Subscribe to webhooks using the Page token
      let webhookSubscribed = igAccount.webhookSubscribed;
      try {
        const subscription = await subscribeInstagramAccountToWebhooks(
          matchedPage.instagram_business_account.id,
          pageToken
        );
        webhookSubscribed = Boolean(subscription.success);
      } catch (subscriptionError) {
        console.warn(
          "[FacebookCallback] Webhook subscription failed:",
          subscriptionError
        );
      }

      await prisma.instagramAccount.update({
        where: { id: igAccount.id },
        data: {
          pageToken: encryptedPageToken,
          tokenExpiresAt,
          webhookSubscribed,
        },
      });

      return NextResponse.redirect(
        `${baseUrl}/dashboard?facebook_connected=true`
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[FacebookCallback] Error:", err);

    return NextResponse.redirect(
      `${baseUrl}/api/fb-fix?error=${encodeURIComponent(message.substring(0, 200))}`
    );
  }
}