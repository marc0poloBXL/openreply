/**
 * Full pipeline test: posts a test comment as @stoiczodiac, then runs the
 * count-poller against a specific media to verify the auto-reply fires.
 *
 * Usage: GET /api/poller-test?mediaId=18085664627243598
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";
import { getRedisConnection } from "@/lib/queue/client";
import { pollAndReplyByCount } from "@/lib/polling/comment-count-poller";

const IG_ID = "17841438935909153";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const mediaId = request.nextUrl.searchParams.get("mediaId");
  const log: string[] = [];
  function line(m: string) { log.push(m); }

  if (!mediaId) {
    line("No mediaId param — running normal poller sweep.");
    try {
      await pollAndReplyByCount();
    } catch (e: any) {
      line("Sweep threw: " + e.message);
    }
    const redis = getRedisConnection();
    const replied = await redis.smembers(`cmt-replied:${IG_ID}`);
    line(`Replied media: ${replied.length}`);
    return NextResponse.json({ ok: true, log, replied });
  }

  line(`Testing media: ${mediaId}`);

  // 1. Get IGAA token
  const account = await prisma.instagramAccount.findFirst({
    where: { instagramId: IG_ID },
    orderBy: { connectedAt: "desc" },
  });
  if (!account?.accessToken) {
    return NextResponse.json({ ok: false, log: [...log, "No IGAA token"] });
  }
  const igaaToken = decryptToken(account.accessToken);

  // 2. Check current media info
  const mediaResp = await fetch(
    `https://graph.instagram.com/v21.0/${mediaId}?fields=id,media_type,comments_count,timestamp&access_token=${igaaToken}`
  );
  const mediaInfo: any = await mediaResp.json();
  const countBefore = mediaInfo.comments_count ?? 0;
  line(`Media: ${mediaId} — comments before: ${countBefore}`);

  // 3. Clear Redis replied set for this media
  try {
    const redis = getRedisConnection();
    await redis.srem(`cmt-replied:${IG_ID}`, mediaId);
    line("Cleared replied set for this media ✅");
  } catch { /* ok */ }

  // 4. Post a test comment as @stoiczodiac
  const testMessage = `🤖 Pipeline test — ${Date.now()}`;
  line(`Posting test comment: "${testMessage}"`);
  const postResp = await fetch(
    `https://graph.instagram.com/v21.0/${mediaId}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        access_token: igaaToken,
        message: testMessage,
      }).toString(),
    }
  );
  const postData: any = await postResp.json();
  if (postData.id) {
    line(`✅ Test comment posted: ${postData.id}`);
    line("Comments count should increase by 1 from viewer perspective.");
  } else {
    line(`❌ Test comment failed: ${postData.error?.message ?? "?"}`);
  }

  // 5. Check the current count after our post
  const checkResp = await fetch(
    `https://graph.instagram.com/v21.0/${mediaId}?fields=id,media_type,comments_count,timestamp&access_token=${igaaToken}`
  );
  const checkInfo: any = await checkResp.json();
  const countAfter = checkInfo.comments_count ?? 0;
  line(`Comments after test post: ${countAfter}`);

  // 6. Now run the count-poller to see if it detects and replies
  line("");
  line("--- Running count-poller ---");
  try {
    await pollAndReplyByCount();
  } catch (e: any) {
    line("❌ Poller threw: " + e.message);
    return NextResponse.json({ ok: false, log });
  }

  // 7. Check if poller detected any new comments
  const redis2 = getRedisConnection();
  const nowReplied = await redis2.sismember(`cmt-replied:${IG_ID}`, mediaId);
  line(`Media in replied set: ${nowReplied ? "✅ YES" : "❌ NO"}`);

  // 8. Fetch the media comments to see if our auto-reply appeared
  line("");
  line("--- Verifying auto-reply ---");
  const commentsResp = await fetch(
    `https://graph.instagram.com/v21.0/${mediaId}/comments?fields=id,text,timestamp&access_token=${igaaToken}`
  );
  const commentsData: any = await commentsResp.json();
  if (commentsData.data?.length) {
    for (const c of commentsData.data) {
      line(`  Comment: "${(c.text || "").substring(0, 80)}" (${c.id})`);
      line(`    timestamp: ${c.timestamp}`);
    }
    line(`Total comments via API: ${commentsData.data.length}`);
  } else {
    line("⚠️ 0 comments returned by API (expected for Business accounts)");
    line("↳ Check the Instagram post directly to see if auto-reply posted.");
  }

  return NextResponse.json({ ok: true, log });
}