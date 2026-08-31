import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can disconnect accounts" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const instagramAccountId =
    typeof body.instagramAccountId === "string" ? body.instagramAccountId : null;

  const accountFilter = {
    workspaceId: context.workspaceId,
    ...(instagramAccountId ? { id: instagramAccountId } : {}),
  };

  // Before deleting, check for active campaigns linked to this account.
  // Prisma's onDelete: Cascade would silently delete them all, which is
  // almost never what the user intended.
  const campaignCount = await prisma.automation.count({
    where: {
      instagramAccount: accountFilter,
      isActive: true,
    },
  });

  if (campaignCount > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Cannot disconnect — this account has ${campaignCount} active campaign(s). Delete or pause them first, then try again.`,
        data: { activeCampaigns: campaignCount },
      },
      { status: 400 }
    );
  }

  await prisma.instagramAccount.deleteMany({ where: accountFilter });

  return NextResponse.json({ success: true });
}
