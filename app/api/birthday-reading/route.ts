/**
 * POST /api/birthday-reading
 *
 * Accept birth details + email/phone from a user requesting
 * their free Stoic birthday reading. Creates/updates the Lead,
 * generates the reading, and schedules followup steps.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/send";
import { birthdayReadingHtml } from "@/lib/email/templates/birthday-reading";
import { scheduleFollowups } from "@/lib/followup/scheduler";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://openreply-zeta-ruby.vercel.app";

/** Zodiac sign lookup by date (month/day only — no year needed). */
function getZodiacSign(month: number, day: number): string {
  const signs: Array<[number, number, string]> = [
    [1, 20, "Capricorn"], [2, 19, "Aquarius"], [3, 21, "Pisces"],
    [4, 20, "Aries"], [5, 21, "Taurus"], [6, 21, "Gemini"],
    [7, 23, "Cancer"], [8, 23, "Leo"], [9, 23, "Virgo"],
    [10, 23, "Libra"], [11, 22, "Scorpio"], [12, 22, "Sagittarius"],
  ];
  for (const [m, d, sign] of signs) {
    if ((month === m && day <= d) || month < m) return sign;
  }
  // December 23–31: loop falls through since no month is < 1 — Capricorn.
  return "Capricorn";
}

const STOIC_PHILOSOPHERS: Record<string, { name: string; title: string }> = {
  "Aries":     { name: "Epictetus",    title: "The Disciplined Warrior" },
  "Taurus":    { name: "Zeno",         title: "The Steadfast Founder" },
  "Gemini":    { name: "Seneca",       title: "The Reflective Scholar" },
  "Cancer":    { name: "Musonius Rufus", title: "The Nurturing Sage" },
  "Leo":       { name: "Marcus Aurelius", title: "The Philosopher King" },
  "Virgo":     { name: "Epictetus",    title: "The Mindful Worker" },
  "Libra":     { name: "Seneca",       title: "The Balanced Stoic" },
  "Scorpio":   { name: "Musonius Rufus", title: "The Resilient Teacher" },
  "Sagittarius": { name: "Zeno",       title: "The Visionary Guide" },
  "Capricorn": { name: "Marcus Aurelius", title: "The Disciplined Emperor" },
  "Aquarius":  { name: "Seneca",       title: "The Free Thinker" },
  "Pisces":    { name: "Zeno",         title: "The Compassionate Sage" },
};

const ELEMENTS: Record<string, string> = {
  "Aries": "fire", "Leo": "fire", "Sagittarius": "fire",
  "Taurus": "earth", "Virgo": "earth", "Capricorn": "earth",
  "Gemini": "air", "Libra": "air", "Aquarius": "air",
  "Cancer": "water", "Scorpio": "water", "Pisces": "water",
};

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
    const philosopher = STOIC_PHILOSOPHERS[zodiacSign] ?? { name: "Marcus Aurelius", title: "The Reflective Stoic" };
    const element = ELEMENTS[zodiacSign] ?? "earth";

    // Build the reading text (simulated — in production this calls an LLM)
    // For v1 we generate a solid template-based reading
    const readingText = generateReading(bd, zodiacSign, philosopher, element);

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

/**
 * Generate a Stoic Life Blueprint reading based on birth date.
 * This is a template-based version for v1. In production this
 * would call an LLM with the full prompt from the birthday framework.
 */
function generateReading(
  birthDate: Date,
  sign: string,
  philosopher: { name: string; title: string },
  element: string,
): string {
  const elementDesc: Record<string, string> = {
    fire: "impulsive, passionate, and quick to act",
    earth: "grounded, patient, and deliberate",
    air: "intellectual, curious, and analytical",
    water: "intuitive, emotional, and adaptable",
  };

  const strengths: Record<string, string[]> = {
    fire: ["Courage to act when others hesitate", "Natural leadership that inspires", "Resilience under pressure"],
    earth: ["Unshakable discipline in daily habits", "Practical wisdom you can apply", "Patience for long-term goals"],
    air: ["Clarity of thought in complex situations", "Ability to see multiple perspectives", "Gift for communicating truth"],
    water: ["Deep emotional intelligence", "Adaptability without losing your center", "Empathy that builds trust"],
  };

  const growthEdges: Record<string, string[]> = {
    fire: ["Impatience with slower processes — rushing past necessary steps", "A tendency to react before reflecting"],
    earth: ["Resistance to change even when flexibility serves you", "Over-attachment to routine and comfort"],
    air: ["Overthinking what can only be felt or acted on", "Detachment from your own emotions and body"],
    water: ["Absorbing others' moods as your own", "Avoiding confrontation at the cost of truth"],
  };

  const desc = elementDesc[element] || "unique in your approach";
  const sigStrengths = strengths[element] || strengths.earth;
  const sigEdges = growthEdges[element] || growthEdges.earth;

  return `**Your Stoic Archetype: ${philosopher.name} — ${philosopher.title}**

Born under **${sign}**, an **${element}** sign, you carry the temperament of one who is ${desc}. Like the Stoics, your character is not your fate — it is your raw material. What you build with it is up to you.

**Your Nature:** ${sign} energy meets Stoic discipline. You are naturally drawn to meaning, not comfort. When you align your actions with your values, you feel alive. When you drift, you feel it in your body.

**Three Strengths to Practice**

1. **${sigStrengths[0]}** — This is your native gift. Exercise it daily, even in small choices.
2. **${sigStrengths[1]}** — Others rely on this in you, whether they say it or not.
3. **${sigStrengths[2]}** — This is what carries you through difficulty. Do not neglect it.

**Two Growth Edges**

1. **${sigEdges[0]}** — The Stoic practice: pause before acting. Ask, "Does this serve wisdom or impulse?"
2. **${sigEdges[1]}** — The Stoic practice: examine the impression before accepting it. Not every feeling is a fact.

**A Seven-Day Practice**

Each morning, ask yourself one question: *"What will I do today that my future self would thank me for?"* Write the answer. At night, ask: *"Did I act on what I value?"* No judgment — just observe.

**A Question for Your Journal**

*Where in my life am I trading what I most want for what I want right now?*

**The Next Page**

This reading used only your birth date. A fuller symbolic chart — using your exact birth time and birthplace — reveals the timing of your life's key cycles: when to act, when to prepare, and which virtues each season asks of you. That deeper map awaits when you are ready.`;
}