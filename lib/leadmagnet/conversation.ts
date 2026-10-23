/**
 * Lead-magnet DM conversation helpers.
 *
 * The Instagram DM API has no quick replies, so the free report flow is driven
 * by free-text answers: the worker asks for the zodiac sign, then the email,
 * then delivers the report (DM + email) and ends with the paid upsell.
 *
 * All message text lives here so the DM worker stays readable and the copy can
 * be tweaked in one place.
 */

import { prisma } from "@/lib/db/client";

// ─── Sign parsing ──────────────────────────────────────────────────────────────

/** Normalized sign → canonical name. Accepts accented/unaccented spellings. */
export const SIGN_ALIASES: Record<string, string> = {
  aries: "Aries",
  belier: "Aries",
  bélier: "Aries",
  taurus: "Taurus",
  taureau: "Taurus",
  gemini: "Gemini",
  gemeaux: "Gemini",
  gémeaux: "Gemini",
  cancer: "Cancer",
  leo: "Leo",
  lion: "Leo",
  virgo: "Virgo",
  vierge: "Virgo",
  libra: "Libra",
  balance: "Libra",
  scorpio: "Scorpio",
  scorpion: "Scorpio",
  sagittarius: "Sagittarius",
  sagittaire: "Sagittarius",
  capricorn: "Capricorn",
  capricorne: "Capricorn",
  aquarius: "Aquarius",
  verseau: "Aquarius",
  pisces: "Pisces",
  poissons: "Pisces",
};

// Extra capitalized variants (French "Bélier" etc.) normalize via lowercase.
export function isKnownSign(value: string): boolean {
  return value in SIGN_ALIASES;
}

/** Map a user's answer to a canonical sign name, or null if unrecognized. */
export function parseSignAnswer(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  return SIGN_ALIASES[normalized] ?? null;
}

// ─── Copy ──────────────────────────────────────────────────────────────────────

/** First message of the flow, sent when the user's DM matches a lead-magnet campaign. */
export function zodiacPrompt(commenterName: string | null): string {
  const name = commenterName ? `${commenterName}, ` : "";
  return (
    `${name}welcome to your free Stoic reading 🤍 I'm the Stoic guide here, and before I send your report ` +
    `I need one small thing from you.\n\n` +
    `🌙 What is your zodiac sign?\n\n` +
    `(reply with just the sign, e.g. "Leo" or "Lion" — I'll take it from there)`
  );
}

/** Sent when the user's answer is not a recognized sign. */
export function zodiacRetry(): string {
  return (
    `I didn't catch that one 🌙\n\n` +
    `Reply with your zodiac sign, e.g. "Leo", "Cancer", "Scorpio", "Capricorn"... ` +
    `(or in French: "Lion", "Cancer", "Scorpion", "Capricorne"...)`
  );
}

/** Sent after the sign is confirmed — we ask for the email to save the report. */
export function emailPrompt(sign: string, commenterName: string | null): string {
  const name = commenterName ? `${commenterName}, ` : "";
  return (
    `${name}perfect — ${sign} it is 🦁\n\n` +
    `Your free Stoic reading is being prepared. To send it to you, ` +
    `I just need your email address:\n\n` +
    `✉️ Reply with your email (e.g. you@email.com)\n\n` +
    `I'll send your report there as a PDF you can keep. `
  );
}

/** Sent when "email" looked like a user's handle (a @username), not an address. */
export function emailRetry(): string {
  return (
    `That looks like an Instagram handle, not an email ✉️\n\n` +
    `Reply with your full email address (e.g. you@email.com) so I can send your report.`
  );
}

/** Follow-up after confirmation (matches the Claude.md consent/opt-out rules). */
export function emailConfirmedReply(sign: string): string {
  return (
    `Got it! ✅ Your free ${sign} reading is on its way to your inbox.\n\n` +
    `📩 Check your email in a few minutes — I've sent a PDF you can keep, plus ` +
    `a downloadable copy here.`
  );
}

/** Delivered with the free report link — sets up the paid upsell honestly. */
export function reportMessage(
  sign: string,
  pdfUrl: string
): string {
  return (
    `✨ Your free ${sign} Stoic reading is ready!\n\n` +
    `Here's the PDF version to keep:\n${pdfUrl}\n\n` +
    `I've also emailed it to you. It's yours — no strings attached 💛`
  );
}

/** The paid upsell, sent right after the free report. */
export function upsellMessage(sign: string): string {
  return (
    `🔮 One more thing — and no pressure at all.\n\n` +
    `Your free reading was based on your birth date only. The full Stoic Birth Chart ` +
    `adds your exact birth time and birthplace, and reveals the timing of your life's ` +
    `key cycles: when to act, when to prepare, which virtue each season asks of you.\n\n` +
    `It's a deeper, 12-page symbolic reading — and since you already have the free ` +
    `blueprint, the full chart is yours for a one-time ${"$27"}.\n\n` +
    `If you'd like it, just reply "FULL" and I'll send you the private link to unlock it. 💛`
  );
}

/** End of the flow — user said no (or anything that isn't "full"). */
export function declineMessage(): string {
  return (
    `No worries at all 💛 The free reading is yours to keep — check your inbox.\n\n` +
    `If you change your mind later, just message me "FULL" and I'll share the link.`
  );
}

/** When the user taps a postback button mid-flow (not expected in v1). */
export function unknownFlowMessage(): string {
  return (
    `Almost done with your free reading ✨ Reply with your zodiac sign ` +
    `(e.g. "Leo") to continue.`
  );
}

/** When the email provided is not deliverable-looking. */
export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// ─── State machine helpers ─────────────────────────────────────────────────────

export interface FlowAutomation {
  id: string;
  instagramAccountId: string;
  dmLeadMagnetEnabled: boolean;
  instagramAccount: { instagramId: string; accessToken: string | null };
}

/** Get (or create) the flow row for a user on a campaign — the current step. */
export async function getFlowState(
  automationId: string,
  instagramAccountId: string,
  userId: string
): Promise<{
  id: string;
  step: string;
  zodiacSign: string | null;
  email: string | null;
  readingId: string | null;
  attemptCount: number;
  isNew: boolean;
}> {
  const existing = await prisma.dmFlowState.findUnique({
    where: { automationId_userId: { automationId, userId } },
  });
  if (existing) {
    return { ...existing, isNew: false };
  }
  const created = await prisma.dmFlowState.create({
    data: { automationId, instagramAccountId, userId },
  });
  return { ...created, isNew: true };
}