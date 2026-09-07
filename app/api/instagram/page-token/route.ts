import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { encryptToken } from "@/lib/meta/oauth";

export async function POST(request: NextRequest) {
  const { instagramAccountId, pageToken, cronSecret } = await request.json();
  if (!pageToken) {
    return NextResponse.json(
      { success: false, error: "Missing pageToken" },
      { status: 400 }
    );
  }

  // Allow cron-secret auth for programmatic access
  const isCronAuth = cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET;

  if (!isCronAuth) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Not logged in" }, { status: 401 });
    }

    if (!instagramAccountId) {
      return NextResponse.json(
        { success: false, error: "Missing instagramAccountId" },
        { status: 400 }
      );
    }

    // Verify user has access to this account's workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: {
        userId: session.user.id,
        workspace: { instagramAccounts: { some: { id: instagramAccountId } } },
      },
    });

    if (!membership) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Not permitted" }, { status: 403 });
    }
  }

  try {
    // Find the Instagram account (first one if cron auth, specified one if user auth)
    let accountId = instagramAccountId;
    if (!accountId) {
      const first = await prisma.instagramAccount.findFirst({ orderBy: { connectedAt: "desc" } });
      if (!first) {
        return NextResponse.json({ success: false, error: "No Instagram account" }, { status: 404 });
      }
      accountId = first.id;
    }

    const encrypted = encryptToken(pageToken.trim());
    const expiresAt = new Date(Date.now() + 55 * 24 * 60 * 60 * 1000);

    await prisma.instagramAccount.update({
      where: { id: accountId },
      data: { pageToken: encrypted, tokenExpiresAt: expiresAt },
    });

    // Also try subscribing webhooks
    const { subscribeInstagramAccountToWebhooks } = await import("@/lib/meta/client");
    let subscribed = false;
    try {
      const result = await subscribeInstagramAccountToWebhooks(
        "17841438935909153",
        pageToken.trim()
      );
      subscribed = Boolean(result.success);
      await prisma.instagramAccount.update({
        where: { id: accountId },
        data: { webhookSubscribed: subscribed },
      });
    } catch (e) {
      // non-critical
    }

    return NextResponse.json({ success: true, webhookSubscribed: subscribed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}