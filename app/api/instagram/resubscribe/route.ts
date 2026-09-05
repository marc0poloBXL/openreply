import { NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { subscribeInstagramAccountToWebhooks } from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";

export async function POST() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const account = await prisma.instagramAccount.findFirst({
    where: { workspaceId },
    orderBy: { connectedAt: "desc" },
  });

  if (!account) {
    return NextResponse.json(
      { success: false, error: "No Instagram account connected" },
      { status: 400 }
    );
  }

  try {
    // Use Page token when available (works with graph.facebook.com),
    // fall back to IGAA token for graph.instagram.com
    const token = account.pageToken
      ? decryptToken(account.pageToken)
      : decryptToken(account.accessToken);
    const result = await subscribeInstagramAccountToWebhooks(
      account.instagramId,
      token
    );

    await prisma.instagramAccount.update({
      where: { id: account.id },
      data: { webhookSubscribed: true },
    });

    return NextResponse.json({
      success: true,
      data: { result, instagramId: account.instagramId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
