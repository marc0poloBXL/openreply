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

  const results: Record<string, unknown> = {};
  const accessToken = decryptToken(account.accessToken);
  const version = getMetaGraphApiVersion();

  // Test 1: graph.instagram.com /me (confirm token is valid and see permissions)
  {
    const url = new URL(`https://graph.instagram.com/${version}/me`);
    url.searchParams.set("fields", "id,user_id,username,name,account_type,followers_count");
    url.searchParams.set("access_token", accessToken);
    const resp = await fetch(url.toString());
    results.igMe = { status: resp.status, data: await resp.json() };
  }

  // Test 2: graph.instagram.com /me/media?fields=comments (not count, actual comments)
  {
    const url = new URL(`https://graph.instagram.com/${version}/me/media`);
    url.searchParams.set("fields", "id,media_type,comments_count,caption,timestamp,permalink");
    url.searchParams.set("limit", "3");
    url.searchParams.set("access_token", accessToken);
    const resp = await fetch(url.toString());
    const raw = await resp.json();
    results.mediaRaw = { status: resp.status, data: raw };
  }

  // Test 3: Try to get a facebook page token by checking if there's a linked FB page
  // First try the /me endpoint on FB graph with the IG token
  {
    const url = new URL(`https://graph.facebook.com/${version}/me`);
    url.searchParams.set("fields", "id,name");
    url.searchParams.set("access_token", accessToken);
    const resp = await fetch(url.toString());
    results.fbMe = { status: resp.status, data: await resp.json() };
  }

  // Test 4: debug_token endpoint to check what the token actually is
  {
    const url = new URL(`https://graph.instagram.com/${version}/me`);
    // For debugging, let's also check the token info
    results.tokenInfo = {
      prefix: accessToken.substring(0, 20) + "...",
      length: accessToken.length,
      startsWithFb: accessToken.startsWith("IG"),
    };
  }

  // Test 5: Try accessing an IG Business account through FB graph
  // The Instagram Business Account ID is the user_id from /me
  {
    const igUserId = account.instagramId;
    const url = new URL(`https://graph.facebook.com/${version}/${igUserId}/media`);
    url.searchParams.set("fields", "id,comments_count");
    url.searchParams.set("access_token", accessToken);
    const resp = await fetch(url.toString());
    results.fbIgMedia = { status: resp.status, data: await resp.json() };
  }

  return NextResponse.json({ success: true, data: results });
}