import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { canConnectInstagramAccount } from "@/lib/instagram-accounts";
import { getLongLivedToken, subscribeInstagramAccountToWebhooks } from "@/lib/meta/client";
import {
  encryptToken,
  exchangeCodeForToken,
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

    // Step 1: Exchange Instagram auth code for Instagram Business token
    const { accessToken: igToken, userId } = await exchangeCodeForToken(
      code,
      redirectUri
    );

    // Step 2: Exchange for a long-lived Instagram token
    const { accessToken: longLivedToken } = await getLongLivedToken(igToken);

    // Step 3: Also try to get a Facebook Page token for comment reading
    // (This may fail if FB Login isn't configured — gracefully fall back)
    let finalToken = longLivedToken;
    let pageToken: string | null = null;
    let fbAccountLinked = false;

    try {
      // First get a short-lived FB token
      const { accessToken: fbShortToken } = await exchangeFbCodeForToken(
        code,
        redirectUri
      );
      // Exchange for long-lived
      const { accessToken: fbLongToken } = await exchangeFbLongLivedToken(fbShortToken);

      // Find connected Instagram Business page
      const version = process.env.META_GRAPH_API_VERSION ?? "v25.0";
      const pagesResp = await fetch(
        `https://graph.facebook.com/${version}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${fbLongToken}`
      );
      const pagesData = await pagesResp.json() as { data?: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string; username: string } }> };

      if (pagesData.data) {
        for (const page of pagesData.data) {
          if (page.instagram_business_account?.id === userId) {
            pageToken = page.access_token;
            fbAccountLinked = true;
            break;
          }
        }
      }
    } catch (fbErr) {
      console.warn("[Callback] FB Page token fetch failed (non-fatal):", fbErr);
    }

    if (pageToken) {
      // Use the Page token — it works with graph.facebook.com for both media AND comments
      finalToken = pageToken;
    }

    // Step 4: Get user info
    const version = process.env.META_GRAPH_API_VERSION ?? "v25.0";
    let instagramId = userId;
    let username = "";

    if (pageToken && fbAccountLinked) {
      // We have a Page token — find the Instagram user info
      const meResp = await fetch(
        `https://graph.facebook.com/${version}/${userId}?fields=username,name,profile_picture_url&access_token=${pageToken}`
      );
      const meData = await meResp.json();
      instagramId = meData.id || userId;
      username = meData.username || meData.name || "";
    } else {
      // Fall back to Instagram token
      const meResp = await fetch(
        `https://graph.instagram.com/${version}/me?fields=user_id,username&access_token=${longLivedToken}`
      );
      const meData = await meResp.json();
      instagramId = meData.user_id || userId;
      username = meData.username || "";
    }

    const encryptedToken = encryptToken(finalToken);
    const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    let webhookSubscribed = false;
    try {
      const subscription = await subscribeInstagramAccountToWebhooks(
        instagramId,
        finalToken
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
        name: username,
        accessToken: encryptedToken,
        tokenExpiresAt,
        webhookSubscribed,
      },
      update: {
        workspaceId: state.workspaceId,
        username,
        name: username,
        accessToken: encryptedToken,
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