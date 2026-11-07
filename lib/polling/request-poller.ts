/**
 * Instagram message request poller.
 *
 * Non-follower DMs land in Instagram's "Requests" folder, where webhooks do NOT
 * fire. This poller periodically checks the folder via the Meta Conversations API
 * (graph.facebook.com with a Page Token), auto-replies to accept each request
 * (moves it to inbox and activates webhooks), and enqueues the original message
 * for normal DM processing.
 *
 * Requirements:
 *   - InstagramAccount must have a `pageToken` (Page Access Token, EA-...)
 *   - The Instagram account must be linked to a Facebook Business Page
 *   - Token is decrypted via decryptToken() (AES-256-GCM)
 *
 * This is a best-effort safety net. Every operation is wrapped in try/catch;
 * the poller never throws.
 */

import { prisma } from "@/lib/db/client";
import { getRedisConnection, getDMQueue, MESSAGE_JOB_NAME } from "@/lib/queue/client";
import type { ProcessMessageJob } from "@/lib/queue/client";
import { decryptToken } from "@/lib/meta/oauth";
import { sendDirectMessage } from "@/lib/meta/client";
import { getMetaGraphApiVersion } from "@/lib/env";

const IG_USER_ID = "17841438935909153";

/** Auto-reply sent to accept a message request. Moves the conversation to the
 * inbox so subsequent messages fire webhooks. */
const AUTO_REPLY =
  "✅ Thanks for reaching out! I've accepted your request. How can I help you?";

/**
 * One sweep: fetch pending message requests, auto-accept each, and enqueue
 * the original message for DM processing. Best-effort — never throws.
 */
export async function pollMessageRequests(): Promise<void> {
  const account = await prisma.instagramAccount.findFirst({
    where: { instagramId: IG_USER_ID },
    orderBy: { connectedAt: "desc" },
  });

  if (!account?.pageToken) {
    console.log("[RequestPoller] No pageToken — skipping");
    return;
  }

  let pageToken: string;
  try {
    pageToken = decryptToken(account.pageToken);
  } catch {
    console.log("[RequestPoller] Failed to decrypt pageToken");
    return;
  }

  // ---------- fetch message requests ----------

  const ver = getMetaGraphApiVersion();
  const conversationsFields =
    "participants,updated_time,messages.limit(1){message,from,created_time}";

  let conversations: any[];
  const url = new URL(
    `https://graph.facebook.com/${ver}/${IG_USER_ID}/conversations`,
  );
  url.searchParams.set("platform", "instagram");
  url.searchParams.set("folder", "requests");
  url.searchParams.set("fields", conversationsFields);
  url.searchParams.set("access_token", pageToken);

  try {
    const resp = await fetch(url.toString());
    const body: any = await resp.json();
    if (body.error) {
      console.log("[RequestPoller] Fetch error:", body.error.message);
      return;
    }
    conversations = body.data ?? [];
  } catch (e: any) {
    console.log("[RequestPoller] Fetch threw:", e.message);
    return;
  }

  if (conversations.length === 0) {
    console.log("[RequestPoller] No pending requests");
    return;
  }

  // ---------- process each request ----------

  const redis = getRedisConnection();
  const repliedKey = `req-replied:${IG_USER_ID}`;
  let accepted = 0;

  for (const conv of conversations) {
    const messages = conv.messages?.data ?? [];
    if (messages.length === 0) continue;

    const firstMsg = messages[0];
    const senderId: string | undefined = firstMsg.from?.id;
    const messageText: string = firstMsg.message ?? "";

    if (!senderId) {
      console.log(
        `[RequestPoller] ⚠️ No senderId for conv ${conv.id} — skipping`,
      );
      continue;
    }

    // Already replied to this conversation in a prior sweep
    try {
      const done = await redis.sismember(repliedKey, conv.id);
      if (done) continue;
    } catch {
      // Redis hiccup — skip this conversation rather than stall the whole sweep
      continue;
    }

    // ---------- accept the request ----------
    try {
      const replyResult = await sendDirectMessage(
        pageToken,
        IG_USER_ID,
        senderId,
        AUTO_REPLY,
      );

      if (replyResult.message_id) {
        await redis.sadd(repliedKey, conv.id);
        accepted++;
        console.log(
          `[RequestPoller] ✅ Accepted request from ${senderId} (conv=${conv.id})`,
        );

        // Enqueue the original message for DM processing.
        // We use the conversation id as deterministic jobId so BullMQ
        // deduplicates — if the job is already in the queue we just skip.
        const job: ProcessMessageJob = {
          instagramAccountId: account.instagramId,
          messageId: firstMsg.id ?? `req_${conv.id}`,
          messageText,
          senderId,
        };
        await getDMQueue()
          .add(MESSAGE_JOB_NAME, job, {
            jobId: `request:${conv.id}`,
          })
          .catch(() => {
            console.log(
              `[RequestPoller] ⚠️ Failed to enqueue job for ${conv.id}`,
            );
          });
      } else {
        console.log(
          `[RequestPoller] ❌ Reply failed for ${conv.id}: no message_id returned`,
        );
      }
    } catch (e: any) {
      console.log(`[RequestPoller] Reply threw for ${conv.id}:`, e.message);
    }
  }

  // ---------- log to operational events ----------
  if (accepted > 0) {
    await prisma.operationalEvent
      .create({
        data: {
          workspaceId: account.workspaceId,
          source: "POLLER",
          level: "INFO",
          message: `RequestPoller: ${accepted} requests accepted this sweep`,
          payload: { accepted, scanned: conversations.length },
        },
      })
      .catch(() => {});
  }

  console.log(
    `[RequestPoller] Sweep done — ${accepted} accepted, ${conversations.length} scanned`,
  );
}