import { prisma } from "@/lib/db/client";
import { generateReportShareSlug } from "@/lib/reports/share";

export const maxDuration = 30;

// eslint-disable-next-line prefer-const
let count = 0;

export async function GET() {
  try {
    const account = await prisma.instagramAccount.findFirst({
      orderBy: { connectedAt: "desc" },
      include: { workspace: true },
    });

    if (!account) return json({ error: "No Instagram account found" });

    const existing = await prisma.automation.findFirst({
      where: { instagramAccountId: account.id },
    });

    const changed: string[] = [];
    const updates: Record<string, unknown> = {};

    if (existing) {
      if (!existing.matchAnyPost) {
        updates.matchAnyPost = true;
        changed.push("matchAnyPost: false→true");
      }
      if (!existing.dmTriggerEnabled) {
        updates.dmTriggerEnabled = true;
        changed.push("dmTriggerEnabled: false→true");
      }
      if (!existing.isActive) {
        updates.isActive = true;
        changed.push("isActive: false→true");
      }

      if (Object.keys(updates).length > 0) {
        const updated = await prisma.automation.update({
          where: { id: existing.id },
          data: updates,
        });
        return json({
          message: `✅ Automation fixed! Changes: ${changed.join(", ")}`,
          automation: updated,
        });
      }

      return json({
        message: "✅ Automation is correctly configured — no changes needed",
        automation: existing,
      });
    }

    // Create if none exists
    const automation = await prisma.automation.create({
      data: {
        name: "Stoic Auto-Reply",
        goal: "Auto-reply to comments and DMs",
        workspaceId: account.workspaceId,
        instagramAccountId: account.id,
        matchAnyPost: true,
        matchAnyWord: true,
        keywords: [],
        dmMessage: "Thanks {username}! Here's something for you 🌿",
        dmTriggerEnabled: true,
        openingDmEnabled: false,
        requireFollow: false,
        followUpEnabled: false,
        publicReplyEnabled: false,
        isActive: true,
        wholeWordMatch: false,
        reportShareSlug: generateReportShareSlug(),
      },
    });

    return json({ message: "✅ Automation created!", automation });
  } catch (e: any) {
    return json({ error: e.message });
  }
}

function json(data: unknown) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}