/**
 * comments_count-based comment poller.
 *
 * Reading comment text via graph.instagram.com returns empty for Business
 * accounts, and graph.facebook.com requires an IG→FB page link that this
 * account doesn't have. The only working approach:
 *
 *   1. Poll `GET /me/media` to read `comments_count` per post
 *   2. When count increases on a post we haven't replied to: post a generic
 *      top-level reply via `POST /{media-id}/comments`
 *   3. Track replied posts in Redis to avoid double-replying
 *
 * This is a best-effort safety net. The reply is generic (no comment text
 * available), fires at most once per media item, and uses the IGAA token
 * on graph.instagram.com exclusively.
 */

import { prisma } from "@/lib/db/client";
import { getRedisConnection } from "@/lib/queue/client";
import { decryptToken } from "@/lib/meta/oauth";

const IG_ID = "17841438935909153";

const DEFAULT_REPLY =
  "Thanks for engaging! 🏛 Which Stoic philosopher resonates with you?";

/**
 * One sweep: fetch recent media, check comments_count, post auto-replies.
 * Best-effort — never throws. Logs through operationalEvent on success.
 */
export async function pollAndReplyByCount(): Promise<void> {
  const account = await prisma.instagramAccount.findFirst({
    where: { instagramId: IG_ID },
    orderBy: { connectedAt: "desc" },
  });

  if (!account?.accessToken) {
    console.log("[CountPoller] No IGAA token — skipping");
    return;
  }

  let igaaToken: string;
  try {
    igaaToken = decryptToken(account.accessToken);
  } catch {
    console.log("[CountPoller] Failed to decrypt IGAA token");
    return;
  }

  // Pick the reply message. Prefer the first active automation's public reply
  // so the page operators have one place to edit the message.
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
      : process.env.COMMENT_POLLER_REPLY || DEFAULT_REPLY;

  // ---------- fetch recent media ----------

  const lookbackMs = Number(process.env.COMMENT_POLLER_LOOKBACK_HOURS ?? 72) * 3_600_000;
  const sinceMs = Date.now() - lookbackMs;
  const maxPerSweep = Number(process.env.COMMENT_POLLER_MAX_PER_SWEEP ?? 5);

  let mediaList: any[];
  const url = new URL("https://graph.instagram.com/v21.0/me/media");
  url.searchParams.set("fields", "id,media_type,comments_count,timestamp");
  url.searchParams.set("limit", String(process.env.COMMENT_POLLER_MEDIA_LIMIT ?? 20));
  url.searchParams.set("access_token", igaaToken);

  try {
    const resp = await fetch(url.toString());
    const body: any = await resp.json();
    if (body.error) {
      console.log("[CountPoller] Media fetch error:", body.error.message);
      return;
    }
    mediaList = body.data ?? [];
  } catch (e: any) {
    console.log("[CountPoller] Media fetch threw:", e.message);
    return;
  }

  // ---------- check each media and reply ----------

  const redis = getRedisConnection();
  const repliedKey = `cmt-replied:${IG_ID}`;
  let replied = 0;

  for (const media of mediaList) {
    // Freshness gate
    const createdMs = Date.parse(media.timestamp);
    if (!createdMs || createdMs < sinceMs) continue;

    // No comments — nothing to do
    const count = typeof media.comments_count === "number" ? media.comments_count : 0;
    if (count === 0) continue;

    // Already replied to this post in a prior sweep
    try {
      const done = await redis.sismember(repliedKey, media.id);
      if (done) continue;
    } catch {
      // Redis hiccup — skip this media rather than stall the whole sweep
      continue;
    }

    // ---------- post the reply ----------
    try {
      const replyResp = await fetch(
        `https://graph.instagram.com/v21.0/${media.id}/comments`,
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
        await redis.sadd(repliedKey, media.id);
        replied++;
        console.log(
          `[CountPoller] ✅ Replied to ${media.id} (count=${count})`
        );
      } else {
        console.log(
          `[CountPoller] ❌ Reply failed for ${media.id}:`,
          replyData.error?.message ?? "no id returned"
        );
      }
    } catch (e: any) {
      console.log(`[CountPoller] Reply threw for ${media.id}:`, e.message);
    }

    if (replied >= maxPerSweep) break;
  }

  // ---------- log to operational events ----------
  if (replied > 0) {
    await prisma.operationalEvent
      .create({
        data: {
          workspaceId: account.workspaceId,
          source: "SYSTEM",
          level: "INFO",
          message: `CountPoller: ${replied} auto-replies posted this sweep`,
          payload: { replied, scanned: mediaList.length },
        },
      })
      .catch(() => {});
  }

  console.log(`[CountPoller] Sweep done — ${replied} replies, ${mediaList.length} scanned`);
}