/**
 * POST/GET /api/followup/process
 *
 * Process pending followups. Protected by cron auth (CRON_SECRET or
 * NEXTAUTH_SECRET). GET is what Vercel Cron sends; POST also accepted
 * for manual triggering from the dashboard.
 *
 * For Vercel Cron, add to vercel.json:
 *   "crons": [{
 *     "path": "/api/followup/process",
 *     "schedule": "0 0,6,12,18 * * *"
 *   }]
 */

import { NextRequest, NextResponse } from "next/server";
import { processPendingFollowups } from "@/lib/followup/processor";
import { isCronAuthorized } from "@/lib/auth/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // allow up to 60s on paid plans

async function handle(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processPendingFollowups();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.log("[FollowupProcess] Error:", e.message);
    return NextResponse.json({ ok: false, error: "Server error." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}