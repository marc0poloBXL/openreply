import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { canConnectInstagramAccount } from "@/lib/instagram-accounts";
import { getLongLivedToken, subscribeInstagramAccountToWebhooks } from "@/lib/meta/client";
import {
  encryptToken,
  exchangeFbCodeForToken,
  exchangeFbLongLivedToken,
  getConnectedPageToken,
  verifyOAuthState,
} from "@/lib/meta/oauth";
import { canManageWorkspace } from "@/lib/workspace-access";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state"));
  const baseUrl = getBaseUrl();

  if (error) {
    return NextResponse.redirect(`${baseUrl}/settings?instagram=denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/settings?instagram=invalid`);
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
    return NextResponse.redirect(`${baseUrl}/settings?instagram=forbidden`);
  }

  try {
    const redirectUri = `${baseUrl}/api/instagram/callback`;

    // Step 1: Exchange Facebook auth code for a short-lived FB user token
    const { accessToken: shortLivedToken } = await exchangeFbCodeForToken(
      code,
      redirectUri
    );

    // Step 2: Exchange for a long-lived FB user token
    const { accessToken: longLivedFbToken } = await exchangeFbLongLivedToken(shortLivedToken);

    // Step 3: Get user info from the FB token to find the Instagram account
    const version = process.env.META_GRAPH_API_VERSION ?? "v25.0";
    const meResp = await fetch(
      `https://graph.facebook.com/${version}/me?fields=id,name&access_token=${longLivedFbToken}`
    );
    const meData = await meResp.json();
    if (!meData.id) throw new Error("Failed to get Facebook user info");

    // Step 4: Get the Instagram Business Account ID
    const igAccountsUrl = new URL(`https://graph.facebook.com/${version}/me/accounts`);
    igAccountsUrl.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username,name}");
    igAccountsUrl.searchParams.set("access_token", longLivedFbToken);
    const accountsResp = await fetch(igAccountsUrl.toString());
    const accountsData = await accountsResp.json() as {
      data?: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string; username: string; name: string } }>;
    };

    if (!accountsData.data) throw new Error("No Facebook pages found");

    // Find the page with an Instagram Business account connected
    let instagramId: string;
    let username: string;
    let pageId: string;
    let pageToken: string;
    let pageName: string;

    const connectedPage = accountsData.data.find(p => p.instagram_business_account);
    if (!connectedPage || !connectedPage.instagram_business_account) {
      throw new Error(
        "Your Instagram Business account must be linked to a Facebook Page. " +
        "Go to Instagram Settings → Account → Linked Accounts → Facebook to connect it."
      );
    }

    instagramId = connectedPage.instagram_business_account.id;
    username = connectedPage.instagram_business_account.username;
    pageId = connectedPage.id;
    pageToken = connectedPage.access_token;
    pageName = connectedPage.name;

    // Check if account already exists
    const connection = await canConnectInstagramAccount({
      workspaceId: state.workspaceId,
      instagramId,
    });
    if (!connection.allowed) {
      return NextResponse.redirect(`${baseUrl}/settings?instagram=already_connected`);
    }

    // Encrypt and store the PAGE access token (this is what we need for API calls)
    const encryptedPageToken = encryptToken(pageToken);
    const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // ~60 days

    let webhookSubscribed = false;
    try {
      const subscription = await subscribeInstagramAccountToWebhooks(
        instagramId,
        pageToken
      );
      webhookSubscribed = Boolean(subscription.success);
    } catch (subscriptionError) {
      console.warn("[Callback] Webhook subscription failed:", subscriptionError);
    }

    await prisma.instagramAccount.upsert({
      where: { instagramId },
      create: {
        workspaceId: state.workspaceId,
        instagramId,
        username,
        name: pageName,
        accessToken: encryptedPageToken,
        tokenExpiresAt,
        webhookSubscribed,
      },
      update: {
        workspaceId: state.workspaceId,
        username,
        name: pageName,
        accessToken: encryptedPageToken,
        tokenExpiresAt,
        webhookSubscribed,
      },
    });

    return NextResponse.redirect(`${baseUrl}/dashboard?connected=true`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Callback] Error:", err);
    await prisma.operationalEvent
      .create({
        data: {
          source: "SYSTEM",
          level: "ERROR",
          workspaceId: state.workspaceId,
          message: "Instagram connection failed",
          payload: { reason: message },
        },
      })
      .catch(() => {});

    return NextResponse.redirect(
      `${baseUrl}/settings?instagram=failed&reason=${encodeURIComponent(message.slice(0, 600))}`
    );
  }
}