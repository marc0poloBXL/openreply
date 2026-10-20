/**
 * GET /api/leads
 *
 * List all leads with their consent status, birthday reading info,
 * and pending followup counts. Authenticated (dashboard).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getCurrentWorkspaceId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const workspaceId = await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const [leads, totals] = await Promise.all([
      prisma.lead.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          email: true,
          phone: true,
          zodiacSign: true,
          stoicMatch: true,
          element: true,
          source: true,
          status: true,
          leadScore: true,
          consentEmail: true,
          consentSms: true,
          birthDate: true,
          createdAt: true,
          lastContactedAt: true,
          _count: {
            select: {
              birthdayReadings: true,
              scheduledFollowups: true,
            },
          },
        },
      }),

      // Aggregate totals
      prisma.$transaction([
        prisma.lead.count({ where: { workspaceId } }),
        prisma.lead.count({ where: { workspaceId, consentEmail: true } }),
        prisma.lead.count({ where: { workspaceId, consentSms: true } }),
        prisma.birthdayReading.count({
          where: { lead: { workspaceId } },
        }),
        prisma.scheduledFollowup.count({
          where: {
            lead: { workspaceId },
            status: "PENDING",
          },
        }),
      ]),
    ]);

    const [total, withEmailConsent, withSmsConsent, withBirthdayReading, pendingFollowups] = totals;

    // Count pending followups per lead
    const pendingCounts = await prisma.scheduledFollowup.groupBy({
      by: ["leadId"],
      where: {
        leadId: { in: leads.map((l) => l.id) },
        status: "PENDING",
      },
      _count: { id: true },
    });
    const pendingMap = new Map(pendingCounts.map((p) => [p.leadId, p._count.id]));

    const rows = leads.map((l) => ({
      id: l.id,
      email: l.email,
      phone: l.phone,
      zodiacSign: l.zodiacSign,
      stoicMatch: l.stoicMatch,
      element: l.element,
      source: l.source,
      status: l.status,
      leadScore: l.leadScore,
      consentEmail: l.consentEmail,
      consentSms: l.consentSms,
      birthDate: l.birthDate?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
      lastContactedAt: l.lastContactedAt?.toISOString() ?? null,
      _readingCount: l._count.birthdayReadings,
      _pendingFollowups: pendingMap.get(l.id) ?? 0,
    }));

    return NextResponse.json({
      ok: true,
      data: {
        leads: rows,
        totals: {
          total,
          withEmailConsent,
          withSmsConsent,
          withBirthdayReading,
          pendingFollowups,
        },
      },
    });
  } catch (e: any) {
    console.log("[Leads API] Error:", e.message);
    return NextResponse.json({ ok: false, error: "Server error." }, { status: 500 });
  }
}