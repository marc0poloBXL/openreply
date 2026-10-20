/**
 * GET /api/birthday-reading/[id]
 *
 * Retrieve a birthday reading by ID (for viewing in browser or email link).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const reading = await prisma.birthdayReading.findUnique({
      where: { id },
      include: {
        lead: {
          select: { email: true, zodiacSign: true, stoicMatch: true, stoicTitle: true, element: true },
        },
      },
    });

    if (!reading) {
      return NextResponse.json({ ok: false, error: "Reading not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      reading: {
        id: reading.id,
        birthDate: reading.birthDate,
        birthTime: reading.birthTime,
        birthplace: reading.birthplace,
        readingType: reading.readingType,
        readingText: reading.readingText,
        pdfUrl: reading.pdfUrl,
        createdAt: reading.createdAt,
        lead: reading.lead,
      },
    });
  } catch (e: any) {
    console.log("[BirthdayReading GET] Error:", e.message);
    return NextResponse.json({ ok: false, error: "Server error." }, { status: 500 });
  }
}