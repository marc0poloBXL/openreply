/**
 * Followup scheduler — creates ScheduledFollowup rows for a lead
 * when a trigger event fires (e.g. birthday reading requested).
 */

import { prisma } from "@/lib/db/client";

/**
 * Schedule all active steps from campaigns that match `triggerEvent`.
 * Returns the number of steps scheduled.
 */
export async function scheduleFollowups(
  leadId: string,
  triggerEvent: string,
): Promise<number> {
  const campaigns = await prisma.followupCampaign.findMany({
    where: { triggerEvent, isActive: true },
    include: {
      steps: {
        where: { isActive: true },
        orderBy: { stepNumber: "asc" },
      },
    },
  });

  if (campaigns.length === 0) return 0;

  let scheduled = 0;

  for (const campaign of campaigns) {
    let cumulativeWaitDays = 0;

    for (const step of campaign.steps) {
      cumulativeWaitDays += step.waitDays;

      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + cumulativeWaitDays);

      // Idempotent: rely on the @@unique([leadId, followupStepId]) guard — a
      // concurrent double-submit cannot schedule the same step twice.
      const created = await prisma.scheduledFollowup.createMany({
        data: {
          leadId,
          followupStepId: step.id,
          status: "PENDING",
          scheduledAt,
        },
        skipDuplicates: true,
      });
      scheduled += created.count;
    }
  }

  return scheduled;
}

/**
 * Cancel all pending followups for a lead (e.g. they purchased).
 */
export async function cancelFollowups(leadId: string): Promise<number> {
  const result = await prisma.scheduledFollowup.updateMany({
    where: { leadId, status: "PENDING" },
    data: { status: "SKIPPED" },
  });
  return result.count;
}