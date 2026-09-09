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

/**
 * Facebook Login callback — second auth step.
 *
 * Called after the user authorizes via Facebook Login. This gives us a
 * FB user token → Page token (EA prefix) that works with graph.facebook.com
 * for reading other users' comments on Instagram Business posts.
 *
 * The state contains the instagramAccountId so we can merge the Page
 * token into the existing Instagram account record.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state"));
  const baseUrl = getBaseUrl();

  if (error) {
    return NextResponse.redirect(`${baseUrl}/settings?facebook=denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/settings?facebook=invalid`);
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(`${baseUrl}/login`);
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

    // Step 3: Get the Instagram Business Account linked to the user's pages
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

    // Find the Page linked to an Instagram account this workspace has connected
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

    // Subscribe to webhooks using the Page token (requires EA token)
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
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[FacebookCallback] Error:", err);
    await prisma.operationalEvent
      .create({
        data: {
          source: "SYSTEM",
          level: "ERROR",
          workspaceId: state.workspaceId,
          message: "Facebook Page connection failed",
          payload: { reason: message },
        },
      })
      .catch(() => {});

    return NextResponse.redirect(
      `${baseUrl}/settings?facebook=failed&reason=${encodeURIComponent(
        message.slice(0, 600)
      )}`
    );
  }
}