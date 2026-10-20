/**
 * Followup processor — runs on a cron/webhook to send pending followups.
 *
 * Called by GET/POST /api/followup/process. Processes up to 50 pending
 * followups per invocation to stay within free-tier timeouts. Idempotent:
 * claims each item atomically as PROCESSING first, then SENT/FAILED, so a
 * crash mid-send never loses an item and a retry never double-sends.
 */

import { prisma } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/send";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://openreply-zeta-ruby.vercel.app";

/** Max followups handled per invocation. */
const BATCH_SIZE = 50;

/** Lead has purchased, and this step is a non-purchased-condition step — skip. */
async function passesCondition(
  conditionType: string | null,
  leadId: string
): Promise<boolean> {
  if (!conditionType) return true;

  const purchased = await prisma.leadEvent.count({
    where: { leadId, type: "purchased" },
  });
  const hasPurchased = purchased > 0;

  switch (conditionType) {
    case "purchased":
      return hasPurchased;
    case "not_purchased":
      return !hasPurchased;
    default:
      return true; // unknown condition — send (safe default)
  }
}

export async function processPendingFollowups(): Promise<{
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
}> {
  const pending = await prisma.scheduledFollowup.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: new Date() },
    },
    take: BATCH_SIZE,
    include: {
      followupStep: true,
      lead: true,
    },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of pending) {
    // Condition check first — skip without claiming if the lead doesn't qualify.
    const ok = await passesCondition(item.followupStep.conditionType, item.leadId);
    if (!ok) {
      await prisma.scheduledFollowup.updateMany({
        where: { id: item.id, status: "PENDING" },
        data: { status: "SKIPPED", errorMessage: "Condition not met" },
      });
      skipped++;
      continue;
    }

    // Atomically claim as PROCESSING (never SENT — a crash would lose the item).
    const claimed = await prisma.scheduledFollowup.updateMany({
      where: { id: item.id, status: "PENDING" },
      data: { status: "PROCESSING" },
    });
    if (claimed.count === 0) continue; // another process claimed it

    try {
      if (item.followupStep.type === "EMAIL") {
        await sendEmailFollowup(item);
      } else if (item.followupStep.type === "SMS") {
        // SMS not yet implemented — log and skip
        console.log(`[Followup] SMS not implemented, skipped followup ${item.id}`);
        await prisma.scheduledFollowup.update({
          where: { id: item.id },
          data: { status: "SKIPPED", errorMessage: "SMS provider not configured" },
        });
        skipped++;
        continue;
      }
      // WAIT steps are already accounted for by the scheduledAt date — mark sent.

      await prisma.scheduledFollowup.update({
        where: { id: item.id },
        data: { status: "SENT", sentAt: new Date() },
      });

      // Record event
      await prisma.leadEvent.create({
        data: {
          leadId: item.leadId,
          type: "followup_sent",
          metadata: {
            followupId: item.id,
            stepType: item.followupStep.type,
            stepNumber: item.followupStep.stepNumber,
            campaignId: item.followupStep.campaignId,
          },
        },
      });

      sent++;
    } catch (err: any) {
      console.log(`[Followup] Failed: ${item.id}`, err.message);
      await prisma.scheduledFollowup.update({
        where: { id: item.id },
        data: { status: "FAILED", errorMessage: err.message.substring(0, 500) },
      });
      failed++;
    }
  }

  return { processed: pending.length, sent, skipped, failed };
}

async function sendEmailFollowup(item: {
  id: string;
  followupStep: { emailSubject: string | null; emailBody: string | null; stepNumber: number };
  lead: { email: string; consentEmail: boolean };
}): Promise<void> {
  if (!item.lead.consentEmail) {
    throw new Error("Lead has not consented to email");
  }
  if (!item.followupStep.emailSubject || !item.followupStep.emailBody) {
    throw new Error("Followup step missing email subject or body");
  }

  // Replace template variables
  const subject = item.followupStep.emailSubject.replace(
    /{{unsubscribe_url}}/g,
    `${BASE_URL}/unsubscribe?email=${encodeURIComponent(item.lead.email)}`
  );
  const html = item.followupStep.emailBody.replace(
    /{{unsubscribe_url}}/g,
    `${BASE_URL}/unsubscribe?email=${encodeURIComponent(item.lead.email)}`
  );

  const ok = await sendEmail({ to: item.lead.email, subject, html });
  if (!ok) {
    throw new Error("sendEmail returned false");
  }
}