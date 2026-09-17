import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { QUESTIONS, gradeQuiz } from "@/lib/quiz/questions";
import { sendQuizResultEmail } from "@/lib/email/send";
import { getCurrentWorkspaceId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { email, answers, result: clientResult } = await request.json();

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: "Invalid email address." });
    }

    // Validate answers
    if (!Array.isArray(answers) || answers.length !== QUESTIONS.length) {
      return NextResponse.json({ ok: false, error: "Invalid quiz answers." });
    }

    // Grade (server-side, never trust the client)
    const result = gradeQuiz(answers);

    const workspaceId = await getCurrentWorkspaceId().catch(() => null);

    // Upsert lead
    const lead = await prisma.lead.upsert({
      where: { email },
      create: {
        email,
        workspaceId,
        zodiacSign: result.zodiacSign,
        stoicMatch: result.stoicMatch,
        stoicTitle: result.stoicTitle,
        element: result.element,
        source: "quiz",
        status: "new",
      },
      update: {
        zodiacSign: result.zodiacSign,
        stoicMatch: result.stoicMatch,
        stoicTitle: result.stoicTitle,
        element: result.element,
        leadScore: { increment: 5 },
      },
    });

    // Record event
    await prisma.leadEvent.create({
      data: {
        leadId: lead.id,
        type: "quiz_completed",
        metadata: {
          element: result.element,
          philosopher: result.stoicMatch,
          answers,
        },
      },
    });

    // Send result email (best-effort)
    const emailSent = await sendQuizResultEmail(email, result);

    return NextResponse.json({
      ok: true,
      emailSent,
      result: {
        zodiacSign: result.zodiacSign,
        stoicMatch: result.stoicMatch,
        stoicTitle: result.stoicTitle,
        element: result.element,
        description: result.description,
        quote: result.quote,
      },
    });
  } catch (e: any) {
    console.log("[QuizSubmit] Error:", e.message);
    return NextResponse.json({ ok: false, error: "Server error. Try again." });
  }
}