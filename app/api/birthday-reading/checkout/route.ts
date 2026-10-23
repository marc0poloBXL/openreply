/**
 * POST /api/birthday-reading/checkout
 *
 * Creates the Stripe Checkout session for the paid full Stoic Birth Chart
 * ($27 one-time). Collected fields: email, birth date, exact birth time and
 * birthplace — the details the free flow intentionally left out.
 *
 * The `flowId` query param (from the DM upsell) is attached as metadata so the
 * paid reading can be linked back to the conversation.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/db/client";
import { getZodiacSign } from "@/lib/zodiac";
import {
  ELEMENTS,
  STOIC_PHILOSOPHERS,
} from "@/lib/leadmagnet/reading";

export const dynamic = "force-dynamic";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://openreply-zeta-ruby.vercel.app";

const PRICE_CENTS = 2700; // $27.00
const PRICE_LABEL = "Full Stoic Birth Chart";

export async function POST(request: NextRequest) {
  try {
    const { email, birthDate, birthTime, birthplace, sign, flowId } =
      await request.json();

    // Validate the same required fields the checkout form enforces.
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Valid email address is required." },
        { status: 400 }
      );
    }
    if (!birthDate || !birthTime || !birthplace?.trim()) {
      return NextResponse.json(
        { error: "Birth date, exact birth time and birthplace are required." },
        { status: 400 }
      );
    }

    const bd = new Date(birthDate);
    if (isNaN(bd.getTime())) {
      return NextResponse.json({ error: "Invalid birth date." }, { status: 400 });
    }
    const month = bd.getUTCMonth() + 1;
    const day = bd.getUTCDate();
    const zodiacSign = sign || getZodiacSign(month, day) || "";
    if (!zodiacSign) {
      return NextResponse.json({ error: "Invalid birth date." }, { status: 400 });
    }
    const philosopher =
      STOIC_PHILOSOPHERS[zodiacSign] ??
      { name: "Marcus Aurelius", title: "The Reflective Stoic" };

    const workspaceId = process.env.LEADS_WORKSPACE_ID || null;

    // Upsert the lead with the full birth details (paid flow).
    const now = new Date();
    const lead = await prisma.lead.upsert({
      where: { email: email.trim().toLowerCase() },
      create: {
        email: email.trim().toLowerCase(),
        workspaceId,
        birthDate: bd,
        birthTime: birthTime ?? null,
        birthplace: birthplace.trim(),
        zodiacSign,
        stoicMatch: philosopher.name,
        stoicTitle: philosopher.title,
        element: ELEMENTS[zodiacSign] ?? "earth",
        source: "birthday_reading_paid",
        status: "customer",
        consentEmail: true,
        consentEmailAt: now,
      },
      update: {
        birthDate: bd,
        birthTime: birthTime ?? undefined,
        birthplace: birthplace.trim(),
        zodiacSign,
        stoicMatch: philosopher.name,
        stoicTitle: philosopher.title,
        element: ELEMENTS[zodiacSign] ?? "earth",
        leadScore: { increment: 20 },
        consentEmail: true,
        consentEmailAt: now,
      },
    });

    // Record the order before redirecting so a failed checkout is traceable.
    const payment = await prisma.payment.create({
      data: {
        leadId: lead.id,
        provider: "stripe",
        providerId: null,
        amountCents: PRICE_CENTS,
        currency: "usd",
        status: "pending",
      },
    });

    await prisma.leadEvent.create({
      data: {
        leadId: lead.id,
        type: "payment_started",
        metadata: { paymentId: payment.id, provider: "stripe", flowId: flowId ?? null },
      },
    });

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      // No key configured: fall back to a manual order status so the flow is
      // still testable end-to-end (the dashboard shows the pending order).
      console.log(
        "[Checkout] STRIPE_SECRET_KEY not set — payment recorded as pending."
      );
      return NextResponse.json({
        ok: true,
        pending: true,
        paymentId: payment.id,
        message: "Payment is being configured. Please try again shortly.",
      });
    }

    const stripe = new Stripe(stripeKey);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: PRICE_CENTS,
            product_data: {
              name: PRICE_LABEL,
              description: `Full Stoic Birth Chart for ${zodiacSign} — exact birth time & birthplace`,
            },
          },
        },
      ],
      customer_email: email.trim().toLowerCase(),
      metadata: {
        paymentId: payment.id,
        leadId: lead.id,
        flowId: flowId ?? "",
        zodiacSign,
      },
      success_url: `${BASE_URL}/birthday-reading/checkout/success?session_id={CHECKOUT_SESSION_ID}&payment=${payment.id}`,
      cancel_url: `${BASE_URL}/birthday-reading/checkout?sign=${encodeURIComponent(zodiacSign)}&flow=${flowId ?? ""}&canceled=1`,
    });

    // Save the provider checkout id onto the order.
    await prisma.payment.update({
      where: { id: payment.id },
      data: { providerId: session.id },
    });

    return NextResponse.json({ ok: true, url: session.url, paymentId: payment.id });
  } catch (e: any) {
    console.log("[Checkout] Error:", e.message);
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 500 }
    );
  }
}