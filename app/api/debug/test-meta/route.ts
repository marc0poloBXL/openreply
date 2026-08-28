import { NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getRecentMediaComments } from "@/lib/meta/client";
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
      const version = getMetaGraphApiVersion();
      const mediaUrl = new URL(`https://graph.instagram.com/${version}/me/media`);
      mediaUrl.searchParams.set("fields", "id,media_type,media_url,comments_count,caption,timestamp");
      mediaUrl.searchParams.set("limit", "5");
      mediaUrl.searchParams.set("access_token", accessToken);
      const resp = await fetch(mediaUrl.toString());
      const raw = await resp.json();
      results.mediaRaw = { status: resp.status, data: raw };
    } catch (e) {
      results.mediaError = e instanceof Error ? e.message : String(e);
    }

    // Test comments on a known media ID (first one from media list)
    const mediaIds = results.mediaRaw && (results.mediaRaw as Record<string, unknown>).data
      ? ((results.mediaRaw as Record<string, unknown>).data as Record<string, unknown>).data as Array<{ id: string; comments_count?: number }>
      : [];
    if (mediaIds.length > 0) {
      const firstMedia = mediaIds[0];
      results.testingMediaId = firstMedia.id;
      results.testingCommentsCount = firstMedia.comments_count;

      // graph.instagram.com — raw
      try {
        const version = getMetaGraphApiVersion();
        const igUrl = new URL(`https://graph.instagram.com/${version}/${firstMedia.id}/comments`);
        igUrl.searchParams.set("fields", "id,text,timestamp,from{id,username}");
        igUrl.searchParams.set("access_token", accessToken);
        const resp = await fetch(igUrl.toString());
        const raw = await resp.json();
        results.igCommentsRaw = { status: resp.status, data: raw };
      } catch (e) {
        results.igCommentsError = e instanceof Error ? e.message : String(e);
      }

      // graph.facebook.com — try with IG token
      try {
        const version = getMetaGraphApiVersion();
        const fbUrl = new URL(`https://graph.facebook.com/${version}/${firstMedia.id}/comments`);
        fbUrl.searchParams.set("fields", "id,text,timestamp,from{id,username}");
        fbUrl.searchParams.set("access_token", accessToken);
        const resp = await fetch(fbUrl.toString());
        const raw = await resp.json();
        results.fbCommentsRaw = { status: resp.status, data: raw };
      } catch (e) {
        results.fbCommentsError = e instanceof Error ? e.message : String(e);
      }

      // graph.facebook.com with ig-user-id
      try {
        const version = getMetaGraphApiVersion();
        const fbMediaUrl = new URL(`https://graph.facebook.com/${version}/${account.instagramId}/media`);
        fbMediaUrl.searchParams.set("fields", "id,comments_count");
        fbMediaUrl.searchParams.set("access_token", accessToken);
        const resp = await fetch(fbMediaUrl.toString());
        const raw = await resp.json();
        results.fbIdMediaRaw = { status: resp.status, data: raw };
      } catch (e) {
        results.fbIdMediaError = e instanceof Error ? e.message : String(e);
      }
    }
  } catch (e) {
    results.decryptError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({ success: true, data: results });
}