import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { canConnectInstagramAccount } from "@/lib/instagram-accounts";
import { subscribeInstagramAccountToWebhooks } from "@/lib/meta/client";
import {
  encryptToken,
  exchangeCodeForToken,
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

    // Step 1: Exchange Instagram auth code for an IGAA token
    const { accessToken: igaaToken, userId: igUserId } =
      await exchangeCodeForToken(code, redirectUri);

    const version = process.env.META_GRAPH_API_VERSION ?? "v26.0";

    // Step 2: Get the Instagram Business Account details
    const meUrl = new URL(`https://graph.instagram.com/${version}/me`);
    meUrl.searchParams.set("fields", "user_id,username,name,account_type,media_count");
    meUrl.searchParams.set("access_token", igaaToken);
    const meResp = await fetch(meUrl.toString());
    const meData = (await meResp.json()) as {
      user_id?: string;
      username?: string;
      name?: string;
      account_type?: string;
    };

    if (!meData.username) {
      throw new Error(
        `Could not get Instagram account details: ${JSON.stringify(meData)}`
      );
    }

    const instagramId = meData.user_id || igUserId;
    const username = meData.username;
    const pageName = meData.name || username;

    // Check if account already exists
    const connection = await canConnectInstagramAccount({
      workspaceId: state.workspaceId,
      instagramId,
    });
    if (!connection.allowed) {
      return NextResponse.redirect(`${baseUrl}/settings?instagram=already_connected`);
    }

    // Encrypt and store the IGAA token
    const encryptedToken = encryptToken(igaaToken);
    const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    let webhookSubscribed = false;
    try {
      // Try webhook subscribe (requires Page token, so may fail with IGAA)
      const subscription = await subscribeInstagramAccountToWebhooks(
        instagramId,
        igaaToken
      );
      webhookSubscribed = Boolean(subscription.success);
    } catch (subscriptionError) {
      console.warn("[Callback] Webhook subscription skipped:", subscriptionError);
    }

    await prisma.instagramAccount.upsert({
      where: { instagramId },
      create: {
        workspaceId: state.workspaceId,
        instagramId,
        username,
        name: pageName,
        accessToken: encryptedToken,
        tokenExpiresAt,
        webhookSubscribed,
      },
      update: {
        workspaceId: state.workspaceId,
        username,
        name: pageName,
        accessToken: encryptedToken,
        tokenExpiresAt,
        webhookSubscribed,
      },
    });

    // After successful connection, redirect user with link to also connect Facebook Page
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