import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Test 1: Prisma client
    const clientOk = typeof prisma.lead !== "undefined";

    // Test 2: Try querying the lead table
    let count = -1;
    let queryError: string | null = null;
    try {
      count = await prisma.lead.count();
    } catch (e: any) {
      queryError = e.message;
    }

    // Test 3: Try creating a test entry
    let createError: string | null = null;
    if (queryError === null) {
      try {
        await prisma.lead.upsert({
          where: { email: "diag@test.com" },
          create: { email: "diag@test.com", source: "quiz", status: "new" },
          update: { leadScore: { increment: 1 } },
        });
      } catch (e: any) {
        createError = e.message;
      }
    }

    return NextResponse.json({
      clientOk,
      leadCount: count,
      queryError,
      createError,
      modelNames: Object.keys(prisma).filter(k => !k.startsWith("_") && !k.startsWith("$")),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}