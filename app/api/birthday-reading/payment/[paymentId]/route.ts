/**
 * GET /api/birthday-reading/payment/[paymentId]
 *
 * Returns a payment order's status. Used by the checkout success page to show
 * "paid / pending / failed" to the user, and by the DM worker to know whether
 * the upsell has already been paid.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const { paymentId } = await params;
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { lead: { select: { email: true, zodiacSign: true } } },
    });
    if (!payment) {
      return NextResponse.json({ ok: false, error: "Payment not found." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      payment: {
        id: payment.id,
        status: payment.status,
        amountCents: payment.amountCents,
        currency: payment.currency,
        provider: payment.provider,
        readingId: payment.readingId,
        leadEmail: payment.lead.email,
        zodiacSign: payment.lead.zodiacSign,
      },
    });
  } catch (e: any) {
    console.log("[Payment GET] Error:", e.message);
    return NextResponse.json({ ok: false, error: "Server error." }, { status: 500 });
  }
}