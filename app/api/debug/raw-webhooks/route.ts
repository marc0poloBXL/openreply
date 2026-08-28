import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export async function GET() {
  const events = await prisma.webhookEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      object: true,
      status: true,
      errorMessage: true,
      processedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ success: true, data: { events, count: events.length } });
}