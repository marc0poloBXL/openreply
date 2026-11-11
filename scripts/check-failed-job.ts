import Redis from "ioredis";
import { Queue } from "bullmq";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error("REDIS_URL environment variable is required");
  process.exit(1);
}

const connection = new Redis(redisUrl);
const queueName = "dm-processing";
const testJobId = "postback_17841438935909153_test_user_123_test_mid_123";

async function main() {
  try {
    const queue = new Queue(queueName, { connection });

    // 1. Try to get the job by ID
    console.log("--- Getting job by ID ---");
    const job = await queue.getJob(testJobId);
    if (job) {
      console.log("Job found:");
      console.log("  id:", job.id);
      console.log("  name:", job.name);
      console.log("  data:", JSON.stringify(job.data, null, 4));
      console.log("  attemptsMade:", job.attemptsMade);
      console.log("  failedReason:", job.failedReason || "(none)");
      console.log("  returnvalue:", JSON.stringify(job.returnvalue));
      console.log("  timestamp:", new Date(job.timestamp).toISOString());
      console.log("  processedOn:", job.processedOn ? new Date(job.processedOn).toISOString() : "(never)");
      console.log("  finishedOn:", job.finishedOn ? new Date(job.finishedOn).toISOString() : "(never)");
    } else {
      console.log("Job not found via queue.getJob()");
    }

    // 2. Check the failed list directly via Redis
    console.log("\n--- Checking BullMQ failed list ---");
    const failedJobs = await connection.lrange(`bull:${queueName}:failed`, 0, 10);
    console.log(`Failed list has ${failedJobs.length} entries`);
    for (const entry of failedJobs) {
      try {
        const parsed = JSON.parse(entry);
        console.log(`  jobId: ${parsed.jobId}, failedReason: ${parsed.failedReason?.substring?.(0, 200) || "(none)"}`);
        if (parsed.jobId === testJobId) {
          console.log("  FULL failedReason:", parsed.failedReason);
          console.log("  FULL stacktrace:", parsed.stacktrace?.join?.("\n") || "(none)");
        }
      } catch {
        console.log(`  raw: ${entry.substring(0, 200)}`);
      }
    }

    // 3. Check active/wait lists for the job
    console.log("\n--- Checking active list ---");
    const activeJobs = await connection.lrange(`bull:${queueName}:active`, 0, 10);
    console.log(`Active: ${activeJobs.length} jobs`);
    for (const entry of activeJobs) {
      try {
        const parsed = JSON.parse(entry);
        console.log(`  jobId: ${parsed.jobId}, name: ${parsed.name || "(unnamed)"}`);
      } catch { }
    }

    console.log("\n--- Checking wait list ---");
    const waitJobs = await connection.lrange(`bull:${queueName}:wait`, 0, 10);
    console.log(`Wait: ${waitJobs.length} jobs`);

    // 4. Check repeatable jobs
    console.log("\n--- Checking repeat list ---");
    const repeatJobs = await connection.lrange(`bull:${queueName}:repeat`, 0, 10);
    console.log(`Repeat: ${repeatJobs.length} jobs`);

    // 5. Direct Redis key lookup for the test job data
    console.log("\n--- Direct Redis key check ---");
    const jobKey = `bull:${queueName}:${testJobId}`;
    const jobType = await connection.type(jobKey);
    console.log(`Key ${jobKey} type: ${jobType}`);
    if (jobType === "hash") {
      const jobData = await connection.hgetall(jobKey);
      console.log("Job hash keys:", Object.keys(jobData));
      if (jobData.failedReason) {
        console.log("failedReason:", jobData.failedReason);
      }
      if (jobData.returnvalue) {
        console.log("returnvalue:", jobData.returnvalue);
      }
      if (jobData.stacktrace) {
        console.log("stacktrace:", jobData.stacktrace.substring(0, 500));
      }
      console.log("Attempts made:", jobData.attemptsMade);
      console.log("Name:", jobData.name);
    }

    // 6. State check
    console.log("\n--- State check ---");
    const state = await job?.getState();
    console.log("Job state:", state);

    await queue.close();
  } catch (e: any) {
    console.error("Script error:", e.message);
  } finally {
    connection.disconnect();
  }
}

main();