import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { encryptToken } from "@/lib/meta/oauth";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Not logged in" }, { status: 401 });
  }

  const { instagramAccountId, pageToken } = await request.json();
  if (!instagramAccountId || !pageToken) {
    return NextResponse.json(
      { success: false, error: "Missing instagramAccountId or pageToken" },
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

  try {
    const encrypted = encryptToken(pageToken.trim());
    const expiresAt = new Date(Date.now() + 55 * 24 * 60 * 60 * 1000);

    await prisma.instagramAccount.update({
      where: { id: instagramAccountId },
      data: { pageToken: encrypted, tokenExpiresAt: expiresAt },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}