import { NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export async function GET() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // Check webhook events from the last hour
  const webhooks = await prisma.webhookEvent.findMany({
    where: {
      workspaceId,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      object: true,
      entry: true,
      status: true,
      errorMessage: true,
      processedAt: true,
      createdAt: true,
    },
  });

  // Also check DM logs
  const dmLogs = await prisma.dmLog.findMany({
    where: {
      workspaceId,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      status: true,
      commentId: true,
      commentText: true,
      commenterName: true,
      errorMessage: true,
      createdAt: true,
      automation: { select: { name: true } },
    },
  });

  // Check latest sweeps
  const sweeps = await prisma.operationalEvent.findMany({
    where: {
      workspaceId,
      source: "SYSTEM",
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      level: true,
      message: true,
      payload: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      webhookCount: webhooks.length,
      webhooks,
      dmLogs,
      sweeps,
      now: new Date().toISOString(),
    },
  });
}