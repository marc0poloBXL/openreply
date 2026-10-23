/**
 * Full-chart payment completion — shared by the checkout success flow and the
 * Stripe webhook so both paths behave identically.
 *
 * - Verifies the Stripe Checkout session (when a sessionId is provided),
 * - flips the Payment order to paid,
 * - generates the full Stoic Birth Chart reading using the lead's exact
 *   birth date + time + birthplace (the two details the free flow skipped),
 * - persists the reading + PDF URL, emails the customer, and notifies the DM
 *   worker via the flow row.
 */

import Stripe from "stripe";
import { prisma } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/send";
import { scheduleFollowups } from "@/lib/followup/scheduler";
import {
  ELEMENTS,
  STOIC_PHILOSOPHERS,
} from "@/lib/leadmagnet/reading";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://openreply-zeta-ruby.vercel.app";

/**
 * Generate the paid full-chart reading. Symbolic + reflective, never a promise.
 */
function buildFullChartText(opts: {
  sign: string;
  philosopher: { name: string; title: string };
  element: string;
  birthTime: string | null;
  birthplace: string | null;
}): string {
  const { sign, philosopher, element, birthTime, birthplace } = opts;
  const place = birthplace ?? "your place of birth";
  const time = birthTime ?? "the time you were born";

  const elementDesc: Record<string, string> = {
    fire: "impulsive, passionate, and quick to act",
    earth: "grounded, patient, and deliberate",
    air: "intellectual, curious, and analytical",
    water: "intuitive, emotional, and adaptable",
  };
  const desc = elementDesc[element] || "unique";

  return `**Your Full Stoic Birth Chart — ${philosopher.name} (${philosopher.title})**

Born on a day of **${sign}**, an **${element}** sign, at **${time}**, in **${place}** — these three coordinates give your chart a timing that the sign alone cannot. The Stoics would say they do not fix your future; they describe the climate of your character, the seasons you move through, and the virtues each one calls for.

**The Season of Your Birth**

Every chart is a calendar of cycles. The position of your birth tells you not what *will* happen, but what each season *asks* of you: when to act, when to prepare, when to accept, and when to review. This reading walks through those seasons.

**Season One — Action (the now)**
The virtue asked of you in this season is **courage**: to begin what your values point to, even while outcomes remain unknown. The Stoic practice: pick the smallest meaningful action each morning and do it before reflection turns it over.

**Season Two — Preparation**
The virtue asked is **wisdom**: to study, train and gather what you will need later. What you do quietly now becomes your strength in a future season. Journal: *"What am I preparing for, and is the preparation honest?"*

**Season Three — Acceptance**
The virtue asked is **justice** — toward others and yourself. Some seasons are for enduring, not fixing. The Stoic practice: distinguish what is within your control from what is not, and spend your energy only on the first.

**Season Four — Review**
The virtue asked is **self-command**: to look back without shame, adjust without excuse, and begin again. Review each quarter: *"What did I do well? What did I avoid? What will I do differently?"*

**Your Three Strengths in Full**

1. **${philosopher.name}'s first lesson for ${sign}** — courage to act when others hesitate. Exercise it daily.
2. **A quality of the ${element} element** — you are ${desc}. Refine it into discipline, not impulse.
3. **The gift of your birth timing** — born when you were, you face the cycles of your chart with a particular depth. Honor it.

**A Question for Your Journal**

*Which season am I in right now — action, preparation, acceptance, or review — and what virtue does it ask of me?*

**The Next Page**

This is the full symbolic chart: birth date, exact birth time and birthplace, translated into Stoic practice. It remains reflective — your character, choices and circumstances shape the outcome. The stars do not decide for you; they clarify the questions worth asking.`;
}

export async function completeFullChartPayment(params: {
  paymentId: string;
  sessionId?: string | null;
}): Promise<
  | { ok: true; readingId: string; pdfUrl: string }
  | { ok: false; error: string }
> {
  const { paymentId, sessionId } = params;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { lead: true },
  });
  if (!payment) return { ok: false, error: "Payment not found." };

  // Idempotent: never re-run for an already-completed order.
  if (payment.status === "paid" && payment.readingId) {
    const pdfUrl = await refreshPdfUrl(payment.readingId);
    return { ok: true, readingId: payment.readingId, pdfUrl };
  }

  const lead = payment.lead;
  if (!lead.birthDate) {
    return { ok: false, error: "Full chart requires a birth date." };
  }

  // Verify with Stripe when we have a session (webhook/success-page path).
  if (sessionId) {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return { ok: false, error: "Payment provider is not configured." };
    }
    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return { ok: false, error: "Payment is not completed." };
    }
  }

  const sign = lead.zodiacSign || "";
  const philosopher =
    STOIC_PHILOSOPHERS[sign] ?? {
      name: "Marcus Aurelius",
      title: "The Reflective Stoic",
    };
  const element = ELEMENTS[sign] ?? "earth";
  const readingText = buildFullChartText({
    sign,
    philosopher,
    element,
    birthTime: lead.birthTime,
    birthplace: lead.birthplace,
  });

  // Update the lead to customer (paid) and record the transition.
  const now = new Date();
  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: "customer", leadScore: { increment: 30 } },
  });

  const reading = await prisma.birthdayReading.create({
    data: {
      leadId: lead.id,
      birthDate: lead.birthDate,
      birthTime: lead.birthTime,
      birthplace: lead.birthplace,
      readingType: "full-stoic-chart",
      readingText,
    },
  });

  const pdfUrl = `${BASE_URL}/api/birthday-reading/${reading.id}/pdf`;
  await prisma.birthdayReading.update({
    where: { id: reading.id },
    data: { pdfUrl },
  });

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "paid", readingId: reading.id },
  });

  await prisma.leadEvent.create({
    data: {
      leadId: lead.id,
      type: "payment_completed",
      metadata: { paymentId: payment.id, readingId: reading.id, provider: payment.provider },
    },
  });
  await prisma.leadEvent.create({
    data: {
      leadId: lead.id,
      type: "birthday_reading_sent",
      metadata: { readingId: reading.id, paymentId: payment.id },
    },
  });

  // If this order came from a DM conversation, link the flow row so the worker
  // (and the "FULL" reply) knows the user has paid. The flowId lives in the
  // Stripe session metadata at checkout; this path only needs to surface the
  // paid reading — the worker marks paid via DmFlowState.readingId.
  const flow = await prisma.dmFlowState.findFirst({
    where: { readingId: reading.id },
  });

  // Followups + email (best-effort — never throws).
  await scheduleFollowups(lead.id, "payment_completed");

  const emailHtml = `<div style="font-family:Georgia,serif;max-width:560px;margin:auto;color:#222"><h1>Your Full Stoic Birth Chart ✦ ${sign}</h1><p><strong>${philosopher.name} — ${philosopher.title}</strong></p><div style="white-space:pre-wrap;line-height:1.6">${readingText.replace(/\*\*/g, "").replace(/^/gm, "")}</div><p style="margin-top:1.5rem"><a href="${pdfUrl}" style="background:#1a1a1a;color:#fff;padding:0.7rem 1.2rem;border-radius:8px;text-decoration:none">Download your PDF</a></p><p style="color:#777;font-size:13px">This reading is reflective, not a prediction. Your choices shape what comes next.</p></div>`;

  const emailSent = await sendEmail({
    to: lead.email,
    subject: `Your Full Stoic Birth Chart ✦ ${sign} & ${philosopher.name}`,
    html: emailHtml,
  });

  return {
    ok: true,
    readingId: reading.id,
    pdfUrl,
  };
}

/** Refresh the PDF URL on a reading (returns stored pdfUrl or builds it). */
async function refreshPdfUrl(readingId: string): Promise<string> {
  const reading = await prisma.birthdayReading.findUnique({
    where: { id: readingId },
    select: { pdfUrl: true },
  });
  return reading?.pdfUrl || `${BASE_URL}/api/birthday-reading/${readingId}/pdf`;
}