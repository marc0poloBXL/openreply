/**
 * GET /api/birthday-reading/[id]/pdf
 *
 * Regenerates and returns the personalized Stoic Birthday Reading PDF on
 * demand from the stored reading text. Deterministic and stateless: no
 * disk, so it works on serverless (Vercel) without extra storage.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { buildReadingPdf } from "@/lib/pdf/reading-pdf";

export const dynamic = "force-dynamic";

const READING_TITLES: Record<string, string> = {
  "stoic-life-blueprint": "Your Stoic Life Blueprint",
  "stoic-purpose-finder": "Your Stoic Purpose Finder",
  "stoic-career-compass": "Your Stoic Career Compass",
  "stoic-relationship-mirror": "Your Stoic Relationship Mirror",
  "stoic-wealth-practice": "Your Stoic Wealth Practice",
  "stoic-five-year-compass": "Your Stoic Five-Year Compass",
  "stoic-inner-genius": "Your Stoic Inner Genius",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const reading = await prisma.birthdayReading.findUnique({
      where: { id },
      include: {
        lead: { select: { zodiacSign: true, stoicMatch: true } },
      },
    });

    if (!reading) {
      return new Response("Reading not found.", { status: 404 });
    }

    const title = READING_TITLES[reading.readingType] ?? "Your Stoic Birthday Reading";
    const subtitle = reading.lead?.zodiacSign
      ? `${reading.lead.zodiacSign} · ${reading.lead.stoicMatch ?? "Stoic Reflection"}`
      : "A Stoic Reflection on Your Nature";

    const pdfBytes = await buildReadingPdf({
      readingText: reading.readingText ?? "",
      title,
      subtitle,
    });

    // Copy into a fresh Uint8Array<ArrayBuffer> so the blob accepts the bytes
    // (pdf-lib returns Uint8Array<ArrayBufferLike>, which TS rejects as BlobPart)
    return new Response(new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" }), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="stoic-birthday-reading.pdf"',
      },
    });
  } catch (e: any) {
    console.log("[BirthdayReading PDF] Error:", e.message);
    return new Response("Server error. Try again.", { status: 500 });
  }
}