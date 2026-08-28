import { NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getUserMedia, getRecentMediaComments } from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";
import { getMetaGraphApiVersion } from "@/lib/env";

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
      results.mediaIds = media.map((m: { id: string; media_type?: string; comments_count?: number }) => ({
        id: m.id,
        type: m.media_type,
        comments_count: m.comments_count,
      }));
    } catch (e) {
      results.mediaError = e instanceof Error ? e.message : String(e);
    }

    // If we got media, test comments on the first one
    if (results.mediaIds && Array.isArray(results.mediaIds) && results.mediaIds.length > 0) {
      const firstMedia = (results.mediaIds[0] as { id: string; comments_count?: number });
      results.testingMedia = firstMedia;

      // Try graph.instagram.com
      try {
        const comments = await getRecentMediaComments(
          accessToken,
          firstMedia.id,
          Date.now() - 30 * 24 * 60 * 60 * 1000
        );
        results.instagramGraphComments = {
          count: comments.length,
          sample: comments.slice(0, 3),
        };
      } catch (e) {
        results.instagramGraphError = e instanceof Error ? e.message : String(e);
      }

      // Try graph.facebook.com for comparison
      try {
        const version = getMetaGraphApiVersion();
        const fbUrl = new URL(`https://graph.facebook.com/${version}/${firstMedia.id}/comments`);
        fbUrl.searchParams.set("fields", "id,text,timestamp,from");
        fbUrl.searchParams.set("access_token", accessToken);

        const response = await fetch(fbUrl.toString());
        const data = await response.json();
        results.facebookGraphComments = {
          success: !data.error,
          count: data.data?.length ?? 0,
          sample: data.data?.slice(0, 3) ?? [],
          error: data.error,
        };
      } catch (e) {
        results.facebookGraphError = e instanceof Error ? e.message : String(e);
      }
    }
  } catch (e) {
    results.decryptError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({ success: true, data: results });
}
