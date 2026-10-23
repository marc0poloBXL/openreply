/**
 * Free-report delivery for the DM lead-magnet flow.
 *
 * Creates the lead (keyed by email), generates the free Stoic reading, persists
 * the BirthdayReading with a PDF URL, emails the reading, schedules the followup
 * campaign, and links everything back to the DmFlowState row so the "FULL"
 * upsell reply can find the reading.
 *
 * Shares the reading template with the public endpoint via lib/leadmagnet/reading.
 */

import { prisma } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/send";
import { birthdayReadingHtml } from "@/lib/email/templates/birthday-reading";
import { scheduleFollowups } from "@/lib/followup/scheduler";
import {
  ELEMENTS,
  generateReading,
  STOIC_PHILOSOPHERS,
} from "@/lib/leadmagnet/reading";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ||
  "https://openreply-zeta-ruby.vercel.app";

export interface DeliverReportResult {
  readingId: string;
  pdfUrl: string;
  philosopherName: string;
  emailSent: boolean;
  followupsScheduled: number;
}

/**
 * Deliver the free report for a user who completed the DM flow (sign + email).
 *
 * - Upserts the lead keyed by email (accumulating leadScore for returners),
 * - creates the BirthdayReading (no birth date — sign only),
 * - persists the PDF URL, emails the reading, schedules followups,
 * - records the DmFlowState.readingId so "FULL" can resolve the upsell.
 */
export async function deliverFreeReport(params: {
  flowStateId: string;
  userId: string;
  sign: string;
  email: string;
}): Promise<DeliverReportResult> {
  const { sign, email } = params;
  const philosopher = STOIC_PHILOSOPHERS[sign] ?? {
    name: "Marcus Aurelius",
    title: "The Reflective Stoic",
  };
  const element = ELEMENTS[sign] ?? "earth";
  const readingText = generateReading(sign);

  const now = new Date();
  const workspaceId =
    process.env.LEADS_WORKSPACE_ID ?? null;

  const lead = await prisma.lead.upsert({
    where: { email: email.trim().toLowerCase() },
    create: {
      email: email.trim().toLowerCase(),
      workspaceId,
      zodiacSign: sign,
      stoicMatch: philosopher.name,
      stoicTitle: philosopher.title,
      element,
      source: "dm_lead_magnet",
      status: "new",
      consentEmail: true,
      consentEmailAt: now,
    },
    update: {
      zodiacSign: sign,
      stoicMatch: philosopher.name,
      stoicTitle: philosopher.title,
      element,
      leadScore: { increment: 10 },
      consentEmail: true,
      consentEmailAt: now,
      lastContactedAt: now,
    },
  });

  await prisma.leadEvent.create({
    data: {
      leadId: lead.id,
      type: "consent_email",
      metadata: { source: "dm_lead_magnet", igUserId: params.userId },
    },
  });

  const reading = await prisma.birthdayReading.create({
    data: {
      leadId: lead.id,
      birthDate: null,
      readingType: "stoic-life-blueprint",
      readingText,
    },
  });

  const pdfUrl = `${BASE_URL}/api/birthday-reading/${reading.id}/pdf`;
  await prisma.birthdayReading.update({
    where: { id: reading.id },
    data: { pdfUrl },
  });

  // Link the flow row to the created reading so the upsell ("FULL") reply can
  // resolve it, and so a second message from the same user continues the flow.
  if (params.flowStateId) {
    await prisma.dmFlowState.update({
      where: { id: params.flowStateId },
      data: { readingId: reading.id },
    });
  }

  await prisma.leadEvent.create({
    data: {
      leadId: lead.id,
      type: "birthday_reading_requested",
      metadata: {
        readingId: reading.id,
        zodiacSign: sign,
        philosopher: philosopher.name,
        source: "dm_lead_magnet",
      },
    },
  });

  // Followups may fire even if the subsequent email send fails — the reading
  // record and PDF URL are already committed, so the followup emails can still
  // reference them.
  const followupsScheduled = await scheduleFollowups(
    lead.id,
    "birthday_reading_requested"
  );

  const emailHtml = birthdayReadingHtml({
    leadName: email.split("@")[0],
    readingTitle: "Your Stoic Life Blueprint",
    readingText,
    birthDate: sign,
    zodiacSign: sign,
    stoicMatch: philosopher.name,
    readingId: reading.id,
    email: lead.email,
    baseUrl: BASE_URL,
  });

  const emailSent = await sendEmail({
    to: lead.email,
    subject: `Your Stoic Zodiac Blueprint ✦ ${sign} & ${philosopher.name}`,
    html: emailHtml,
  });

  await prisma.leadEvent.create({
    data: {
      leadId: lead.id,
      type: "birthday_reading_sent",
      metadata: { readingId: reading.id, emailSent, source: "dm_lead_magnet" },
    },
  });

  return {
    readingId: reading.id,
    pdfUrl,
    philosopherName: philosopher.name,
    emailSent,
    followupsScheduled,
  };
}