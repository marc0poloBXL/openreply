/**
 * Manual trigger for the comments-count poller.
 * Visit /api/poller-test to force-run a sweep and see the result.
 */

import { NextResponse } from "next/server";
import { pollAndReplyByCount } from "@/lib/polling/comment-count-poller";
import { getRedisConnection } from "@/lib/queue/client";

const IG_ID = "17841438935909153";

export const dynamic = "force-dynamic";

export async function GET() {
  const log: string[] = [];
  function line(msg: string) { log.push(msg); }

  line("Triggering count-poller sweep...");
  try {
    await pollAndReplyByCount();
    line("Sweep completed.");
  } catch (e: any) {
    line("Sweep threw: " + e.message);
  }

  // Show the Redis replied set for debugging
  try {
    const redis = getRedisConnection();
    const members = await redis.smembers(`cmt-replied:${IG_ID}`);
    line(`Replied-to media in Redis: ${members.length}`);
    for (const m of members) {
      line(`  - ${m}`);
    }
  } catch (e: any) {
    line("Redis read error: " + e.message);
  }

  return NextResponse.json({ ok: true, log });
}