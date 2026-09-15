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

  // 6. Bypass lookback: directly run the reply logic against this media
  line("");
  line("--- Direct reply test (bypassing lookback) ---");

  // Check if we'd reply: is it in the replied set?
  const redis = getRedisConnection();
  const alreadyReplied = await redis.sismember(`cmt-replied:${IG_ID}`, mediaId);
  line(`Already in replied set: ${alreadyReplied ? "YES — would skip" : "NO — would reply"}`);

  if (!alreadyReplied) {
    // Get the reply message (same logic as pollAndReplyByCount)
    const automation = await prisma.automation.findFirst({
      where: { isActive: true, instagramAccountId: account.id },
      select: { publicReplyMessage: true, publicReplyMessages: true },
    });
    const pool = automation?.publicReplyMessages?.length
      ? automation.publicReplyMessages
      : automation?.publicReplyMessage
        ? [automation.publicReplyMessage]
        : [];
    const replyMessage =
      pool.length > 0
        ? pool[Math.floor(Math.random() * pool.length)]
        : "Thanks for engaging! 🏛 Which Stoic philosopher resonates with you?";

    line(`Would reply with: "${(replyMessage || "").substring(0, 60)}..."`);

    // Actually post the reply
    const replyResp = await fetch(
      `https://graph.instagram.com/v21.0/${mediaId}/comments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          access_token: igaaToken,
          message: replyMessage,
        }).toString(),
      }
    );
    const replyData: any = await replyResp.json();

    if (replyData.id) {
      // Mark as replied in Redis
      await redis.sadd(`cmt-replied:${IG_ID}`, mediaId);
      line(`✅ Auto-reply posted: ${replyData.id}`);
      line("✅ Marked as replied in Redis");
    } else {
      line(`❌ Auto-reply failed: ${replyData.error?.message ?? "?"}`);
    }
  }

  // 7. Final verification
  line("");
  line("--- Final: Check replied set ---");
  const finalReplied = await redis.sismember(`cmt-replied:${IG_ID}`, mediaId);
  line(`Media in replied set: ${finalReplied ? "✅ YES" : "❌ NO"} (will not reply again)`);

  return NextResponse.json({ ok: true, log });
}