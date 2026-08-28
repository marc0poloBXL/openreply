import { NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
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
  if (!account) throw new Error("No account");

  const token = decryptToken(account.accessToken);
  const r: Record<string, unknown> = {};

  // Try the comments endpoint with the first post
  const posts = await (await fetch(`https://graph.instagram.com/v25.0/me/media?fields=id,comments_count&limit=3&access_token=${token}`)).json();
  r.posts = posts;

  if (posts.data?.length) {
    const mid = posts.data[0].id;
    r.testMediaId = mid;
    r.commentsCount = posts.data[0].comments_count;

    // Try graph.instagram.com
    const igResp = await fetch(`https://graph.instagram.com/v25.0/${mid}/comments?access_token=${token}`);
    r.igRaw = { status: igResp.status, body: await igResp.json() };

    // Also try with fields
    const igResp2 = await fetch(`https://graph.instagram.com/v25.0/${mid}/comments?fields=id,text,timestamp,from{id,username}&access_token=${token}`);
    r.igRaw2 = { status: igResp2.status, body: await igResp2.json() };

    // Try with comment_id instead (maybe need to use FB graph)
    // Try the FB graph with token
    const fbResp = await fetch(`https://graph.facebook.com/v25.0/${mid}/comments?access_token=${token}`);
    r.fbRaw = { status: fbResp.status, body: await fbResp.json() };

    const fbResp2 = await fetch(`https://graph.facebook.com/v25.0/${mid}?fields=id,comments{id,text,from,created_time}&access_token=${token}`);
    r.fbRaw2 = { status: fbResp2.status, body: await fbResp2.json() };
  }

  return NextResponse.json({ success: true, data: r });
}