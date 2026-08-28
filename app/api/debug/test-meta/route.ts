import { NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getUserMedia, getRecentMediaComments } from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";

export async function GET() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.instagramAccount.findFirst({
    where: { workspaceId },
    orderBy: { connectedAt: "desc" },
  });

  if (!account) {
    return NextResponse.json({ success: false, error: "No account" });
  }

  const results: Record<string, unknown> = {
    accountId: account.id,
    instagramId: account.instagramId,
    username: account.username,
    webhookSubscribed: account.webhookSubscribed,
  };

  try {
    const accessToken = decryptToken(account.accessToken);
    results.tokenPrefix = accessToken.substring(0, 10) + "...";

    // Test /me/media
    try {
      const media = await getUserMedia(accessToken, 5);
      results.mediaCount = media.length;
      results.mediaIds = media.map((m: { id: string; media_type?: string }) => ({ id: m.id, type: m.media_type }));
    } catch (e) {
      results.mediaError = e instanceof Error ? e.message : String(e);
    }

    // If we got media, test comments on the first one
    if (results.mediaIds && Array.isArray(results.mediaIds) && results.mediaIds.length > 0) {
      try {
        const comments = await getRecentMediaComments(
          accessToken,
          (results.mediaIds[0] as { id: string }).id,
          Date.now() - 30 * 24 * 60 * 60 * 1000
        );
        results.commentCount = comments.length;
        results.sampleComments = comments.slice(0, 3).map((c: { id: string; text?: string; from?: { id: string; username?: string } }) => ({
          id: c.id,
          text: c.text?.substring(0, 50),
          from: c.from?.username,
        }));
      } catch (e) {
        results.commentError = e instanceof Error ? e.message : String(e);
      }
    }
  } catch (e) {
    results.decryptError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({ success: true, data: results });
}
