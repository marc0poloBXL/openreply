/**
 * POST /api/birthday-reading/stripe-webhook
 *
 * Receives Stripe `checkout.session.completed` events and finalizes the
 * full-chart order exactly like the success-page path
 * (lib/payments/full-chart.completeFullChartPayment).
 *
 * Verify the signature with the raw body using STRIPE_WEBHOOK_SECRET. Without
 * a secret configured this endpoint is inert — the success page already
 * finalizes payments, so this is a safety net, not a requirement.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { completeFullChartPayment } from "@/lib/payments/full-chart";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    return NextResponse.json({ received: true, skipped: "not configured" });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();

  const stripe = new Stripe(stripeKey);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentId = session.metadata?.paymentId;
    if (!paymentId) {
      return NextResponse.json({ received: true, skipped: "no paymentId" });
    }

    try {
      await completeFullChartPayment({
        paymentId,
        sessionId: session.id,
      });
    } catch (e: any) {
      console.log("[Stripe webhook] completion failed:", e.message);
      return NextResponse.json({ error: "Completion failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}