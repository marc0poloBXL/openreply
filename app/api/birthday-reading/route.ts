/**
 * POST /api/birthday-reading
 *
 * Accept birth details + email/phone from a user requesting
 * their free Stoic birthday reading. Creates/updates the Lead,
 * generates the reading, and schedules followup steps.
 *
 * The reading template + philosopher mapping live in lib/leadmagnet/reading
 * (shared with the DM lead-magnet flow).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/send";
import { birthdayReadingHtml } from "@/lib/email/templates/birthday-reading";
import { scheduleFollowups } from "@/lib/followup/scheduler";
import { getZodiacSign } from "@/lib/zodiac";
import {
  ELEMENTS,
  generateReading,
  STOIC_PHILOSOPHERS,
} from "@/lib/leadmagnet/reading";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://openreply-zeta-ruby.vercel.app";

export async function POST(request: NextRequest) {
  try {
    const { email, phone, birthDate, birthTime, birthplace, consentEmail, consentSms } = await request.json();

    // Validate required fields
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: "Valid email address is required." }, { status: 400 });
    }
    if (!birthDate) {
      return NextResponse.json({ ok: false, error: "Birth date is required." }, { status: 400 });
    }

    const bd = new Date(birthDate);
    if (isNaN(bd.getTime())) {
      return NextResponse.json({ ok: false, error: "Invalid birth date." }, { status: 400 });
    }

    const month = bd.getUTCMonth() + 1;
    const day = bd.getUTCDate();
    const zodiacSign = getZodiacSign(month, day);
    if (!zodiacSign) {
      return NextResponse.json({ ok: false, error: "Invalid birth date." }, { status: 400 });
    }
    const philosopher = STOIC_PHILOSOPHERS[zodiacSign] ?? { name: "Marcus Aurelius", title: "The Reflective Stoic" };
    const element = ELEMENTS[zodiacSign] ?? "earth";

    // Build the reading text (template-based for v1 — shared with the DM flow)
    const readingText = generateReading(zodiacSign);

    // Resolve the workspace: public endpoint, so no session — use the
    // server-side LEADS_WORKSPACE_ID env so the CRM dashboard can find leads.
    const workspaceId = process.env.LEADS_WORKSPACE_ID || null;

    // Upsert lead
    const now = new Date();
    const lead = await prisma.lead.upsert({
      where: { email },
      create: {
        email,
        workspaceId,
        phone: phone ?? null,
        birthDate: bd,
        birthTime: birthTime ?? null,
        birthplace: birthplace ?? null,
        zodiacSign,
        stoicMatch: philosopher.name,
        stoicTitle: philosopher.title,
        element,
        source: "birthday_reading",
        status: "new",
        consentEmail: !!consentEmail,
        consentSms: !!consentSms,
        consentEmailAt: consentEmail ? now : null,
        consentSmsAt: consentSms ? now : null,
      },
      update: {
        phone: phone ?? undefined,
        birthDate: bd,
        birthTime: birthTime ?? undefined,
        birthplace: birthplace ?? undefined,
        zodiacSign,
        stoicMatch: philosopher.name,
        stoicTitle: philosopher.title,
        element,
        leadScore: { increment: 10 },
        consentEmail: consentEmail ? true : undefined,
        consentSms: consentSms ? true : undefined,
        consentEmailAt: consentEmail ? now : undefined,
        consentSmsAt: consentSms ? now : undefined,
      },
    });

    // Record consent events
    if (consentEmail) {
      await prisma.leadEvent.create({
        data: { leadId: lead.id, type: "consent_email", metadata: { source: "birthday_reading" } },
      });
    }
    if (consentSms) {
      await prisma.leadEvent.create({
        data: { leadId: lead.id, type: "consent_sms", metadata: { source: "birthday_reading" } },
      });
    }

    // Create BirthdayReading record
    const reading = await prisma.birthdayReading.create({
      data: {
        leadId: lead.id,
        birthDate: bd,
        birthTime: birthTime ?? null,
        birthplace: birthplace ?? null,
        readingType: "stoic-life-blueprint",
        readingText,
      },
    });

    // Persist the PDF URL so the reading record and email can always link to it
    const pdfUrl = `${BASE_URL}/api/birthday-reading/${reading.id}/pdf`;
    await prisma.birthdayReading.update({
      where: { id: reading.id },
      data: { pdfUrl },
    });

    // Record request event
    await prisma.leadEvent.create({
      data: {
        leadId: lead.id,
        type: "birthday_reading_requested",
        metadata: {
          readingId: reading.id,
          birthDate: birthDate,
          zodiacSign,
          philosopher: philosopher.name,
        },
      },
    });

    // Record sent event
    await prisma.leadEvent.create({
      data: {
        leadId: lead.id,
        type: "birthday_reading_sent",
        metadata: { readingId: reading.id },
      },
    });

    // Schedule followups from active campaigns
    const followupsScheduled = await scheduleFollowups(lead.id, "birthday_reading_requested");

    // Send email with reading (best-effort)
    const formattedDate = bd.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    const emailHtml = birthdayReadingHtml({
      leadName: email.split("@")[0],
      readingTitle: `Your Stoic Life Blueprint`,
      readingText,
      birthDate: formattedDate,
      zodiacSign,
      stoicMatch: philosopher.name,
      readingId: reading.id,
      email,
      baseUrl: BASE_URL,
    });

    const emailSent = await sendEmail({
      to: email,
      subject: `Your Stoic Birthday Blueprint ✦ ${zodiacSign} & ${philosopher.name}`,
      html: emailHtml,
    });

    return NextResponse.json({
      ok: true,
      readingId: reading.id,
      pdfUrl,
      emailSent,
      followupsScheduled,
      readingText,
      result: {
        zodiacSign,
        stoicMatch: philosopher.name,
        stoicTitle: philosopher.title,
        element,
      },
    });
  } catch (e: any) {
    console.log("[BirthdayReading] Error:", e.message);
    return NextResponse.json({ ok: false, error: "Server error. Try again." }, { status: 500 });
  }
}