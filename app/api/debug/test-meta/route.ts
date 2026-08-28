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
  const r: Record<string, unknown> = {
    username: account.username,
    connectedAt: account.connectedAt,
  };

  // Check webhook events from last 2 hours
  const webhooks = await prisma.webhookEvent.findMany({
    where: {
      workspaceId,
      createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, object: true, status: true, createdAt: true },
  });
  r.recentWebhooks = webhooks;

  // Test: graph.instagram.com comments endpoint in detail
  const posts = await (await fetch(`https://graph.instagram.com/v25.0/me/media?fields=id,comments_count&limit=5&access_token=${token}`)).json();
  if (posts.data?.length) {
    const mid = posts.data[0].id;
    // Try all variants
    const ig = await fetch(`https://graph.instagram.com/v25.0/${mid}/comments?fields=id,text,timestamp,from{id,username}&access_token=${token}`);
    r.igComments = await ig.json();

    // Try with fb graph using version that might accept IG token
    const fb = await fetch(`https://graph.facebook.com/v21.0/${mid}/comments?fields=id,text,created_time,from{id,name}&access_token=${token}`);
    r.fbV21Comments = await fb.json();

    const fb2 = await fetch(`https://graph.facebook.com/v20.0/${mid}/comments?fields=id,text,created_time,from{id,name}&access_token=${token}`);
    r.fbV20Comments = await fb2.json();
  }

  return NextResponse.json({ success: true, data: r });
}