/**
 * Test the deployed lead-magnet fix (commit 5717d99) end-to-end without the
 * webhook route: enqueue a synthetic button-tap postback job directly onto the
 * BullMQ queue with the exact jobId the webhook would have used, so the real
 * PM2 worker ("openreply-worker") picks it up and runs processPostback -> the
 * getFlowState() fix -> DmFlowState ASK_ZODIAC.
 *
 * Connection + job-shape config copied verbatim from lib/queue/client.ts and
 * app/api/webhook/route.ts (postback enqueue, lines 131-146).
 *
 * Run with: npx tsx scripts/enqueue-test-job.ts
 * Pass criterion: DmFlowState goes from 0 to >= 1 (test_user_123 in ASK_ZODIAC).
 */
import "dotenv/config";
import { Queue } from "bullmq";
import Redis from "ioredis";

// Same connection the app uses (client.ts:14-15) — Upstash rediss URL.
const connection = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null, // Required by BullMQ
});

// Same queue the app uses (client.ts:80) — "dm-processing".
const queue = new Queue("dm-processing", { connection });

const JOB_NAME = "process-postback"; // POSTBACK_JOB_NAME (client.ts:72)

async function main() {
  const INSTAGRAM_ACCOUNT_ID = "17841438935909153"; // the IG user id
  const USER_ID = "test_user_123"; // synthetic commenter
  const PAYLOAD = "reveal:cmvgycede0004b8vew43xmmh1"; // automation "LINK — Birthday Reading"
  const MID = "test_mid_123";

  const job = await queue.add(
    JOB_NAME,
    {
      instagramAccountId: INSTAGRAM_ACCOUNT_ID,
      userId: USER_ID,
      payload: PAYLOAD,
      mid: MID,
    },
    {
      // BullMQ forbids ":" in custom job ids; route builds with underscores and
      // strips any colons. Same deterministic id the webhook would generate.
      jobId: `postback_${INSTAGRAM_ACCOUNT_ID}_${USER_ID}_${(MID ?? PAYLOAD).replace(/:/g, "_")}`,
    }
  );

  console.log(JSON.stringify({ jobId: job.id, name: job.name, state: await job.getState() }));
}

main()
  .catch((e) => {
    console.error("Enqueue failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await queue.close();
    connection.disconnect();
  });