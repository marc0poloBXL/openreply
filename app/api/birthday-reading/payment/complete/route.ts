/**
 * POST /api/birthday-reading/payment/complete
 *
 * Called by the checkout success page after the customer returns from Stripe.
 * Verifies the Stripe session, marks the order paid, generates the full
 * (timed) Stoic Birth Chart reading with the birth time + birthplace, stores
 * its PDF, and emails it to the customer.
 *
 * Shared with the Stripe webhook path (lib/payments/full-chart.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { completeFullChartPayment } from "@/lib/payments/full-chart";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { sessionId, paymentId } = await request.json();
    if (!paymentId) {
      return NextResponse.json({ ok: false, error: "Missing payment id." }, { status: 400 });
    }

    // Never double-generate: if the reading already exists, hand it back.
    const existing = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { status: true, readingId: true },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Payment not found." }, { status: 404 });
    }
    if (existing.status === "paid" && existing.readingId) {
      return NextResponse.json({ ok: true, alreadyPaid: true, readingId: existing.readingId });
    }

    const result = await completeFullChartPayment({
      paymentId,
      sessionId: sessionId ?? null,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 402 });
    }

    return NextResponse.json({
      ok: true,
      readingId: result.readingId,
      pdfUrl: result.pdfUrl,
    });
  } catch (e: any) {
    console.log("[Payment complete] Error:", e.message);
    return NextResponse.json({ ok: false, error: "Server error." }, { status: 500 });
  }
}