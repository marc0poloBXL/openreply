/**
 * POST /api/unsubscribe
 *
 * Unsubscribe a lead from email (and optionally SMS) marketing.
 * Sets consent flags to false and cancels any pending followups.
 * CAN-SPAM/GDPR compliance — used by every unsubscribe link in sent emails.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { email, sms } = await request.json().catch(() => ({}));

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: "Valid email required." }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({ where: { email } });
    if (!lead) {
      return NextResponse.json({ ok: true }); // nothing to unsubscribe — idempotent
    }

    await prisma.$transaction([
      // Revoke consent + record the event
      prisma.lead.update({
        where: { email },
        data: { consentEmail: false, consentSms: sms ? false : undefined },
      }),
      prisma.leadEvent.create({
        data: {
          leadId: lead.id,
          type: "consent_email",
          metadata: { action: "unsubscribe", source: "unsubscribe_link" },
        },
      }),
      // Cancel all pending followups
      prisma.scheduledFollowup.updateMany({
        where: { leadId: lead.id, status: { in: ["PENDING", "PROCESSING"] } },
        data: { status: "SKIPPED", errorMessage: "Lead unsubscribed" },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.log("[Unsubscribe] Error:", e.message);
    return NextResponse.json({ ok: false, error: "Server error." }, { status: 500 });
  }
}

/**
 * GET — the URL someone clicks from an email. Redirects to a confirmation page.
 * e.g. /api/unsubscribe?email=x@y.z
 */
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email") ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Valid email required." }, { status: 400 });
  }

  await prisma.lead.updateMany({
    where: { email },
    data: { consentEmail: false },
  });
  const lead = await prisma.lead.findUnique({ where: { email } });
  if (lead) {
    await prisma.scheduledFollowup.updateMany({
      where: { leadId: lead.id, status: { in: ["PENDING", "PROCESSING"] } },
      data: { status: "SKIPPED", errorMessage: "Lead unsubscribed" },
    });
    await prisma.leadEvent.create({
      data: {
        leadId: lead.id,
        type: "consent_email",
        metadata: { action: "unsubscribe", source: "unsubscribe_link" },
      },
    });
  }

  // Simple HTML confirmation page (escaped email, never reflected raw)
  const safeEmail = email.replace(/[<>&"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c
  );
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:60px auto;text-align:center;color:#333">
  <h1 style="font-family:Georgia,serif">You're unsubscribed</h1>
  <p>We've removed <strong>${safeEmail}</strong> from our email list. No more Stoic wisdom from us.</p>
  <p style="font-size:13px;color:#888">You can rejoin anytime at @stoiczodiac.</p>
</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}