import { prisma } from "@/lib/db/client";

export async function canConnectInstagramAccount({
  workspaceId,
  instagramId,
}: {
  workspaceId: string;
  instagramId: string;
}) {
  const existingAccount = await prisma.instagramAccount.findUnique({
    where: { instagramId },
    select: { workspaceId: true },
  });

  if (existingAccount && existingAccount.workspaceId !== workspaceId) {
    return {
      allowed: false,
      reason: "already_connected" as const,
    };
  }

  return {
    allowed: true,
    reason: null,
  };
}

export async function getWorkspaceInstagramAccount(
  workspaceId: string,
  instagramAccountId?: string | null
) {
  if (instagramAccountId && instagramAccountId !== "all") {
    return prisma.instagramAccount.findFirst({
      where: { id: instagramAccountId, workspaceId },
    });
  }

  return prisma.instagramAccount.findFirst({
    where: { workspaceId },
    orderBy: { connectedAt: "desc" },
  });
}

/**
 * Find or create the @stoiczodiac account row keyed on the unique
 * instagramId, bootstrapping the minimal owner + "Stoic Zodiac" workspace
 * chain on a fresh database (e.g. right after switching providers). The
 * token-refresh flows have no session, so they cannot rely on the normal
 * signup path that creates the workspace — they need this instead.
 */
export async function upsertStoicInstagramAccount({
  accessToken,
  tokenExpiresAt,
}: {
  accessToken: string;
  tokenExpiresAt: Date;
}) {
  const PUBLIC_OWNER_EMAIL = "owner@stoiczodiac.com";
  const PUBLIC_OWNER_NAME = "Stoic Zodiac Owner";
  const PUBLIC_WORKSPACE_NAME = "Stoic Zodiac";
  const IG_INSTAGRAM_ID = "17841438935909153";
  const IG_USERNAME = "stoiczodiac";
  const IG_NAME = "Stoic Zodiac";

  let workspace = await prisma.workspace.findFirst({
    where: { name: PUBLIC_WORKSPACE_NAME },
  });
  if (!workspace) {
    const owner = await prisma.user.upsert({
      where: { email: PUBLIC_OWNER_EMAIL },
      update: {},
      create: { email: PUBLIC_OWNER_EMAIL, name: PUBLIC_OWNER_NAME },
    });
    workspace = await prisma.workspace.create({
      data: {
        name: PUBLIC_WORKSPACE_NAME,
        ownerId: owner.id,
        members: { create: { userId: owner.id, role: "OWNER" } },
      },
    });
    console.log(
      `[IGAccount] Bootstrapped workspace "${PUBLIC_WORKSPACE_NAME}" (${workspace.id}) for fresh database`
    );
  }

  return prisma.instagramAccount.upsert({
    where: { instagramId: IG_INSTAGRAM_ID },
    create: {
      workspaceId: workspace.id,
      instagramId: IG_INSTAGRAM_ID,
      username: IG_USERNAME,
      name: IG_NAME,
      accessToken,
      tokenExpiresAt,
    },
    update: {
      accessToken,
      tokenExpiresAt,
    },
  });
}

