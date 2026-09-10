/**
 * Seed Automation — creates a starter campaign for @stoiczodiac
 *
 * Only works if exactly one InstagramAccount is stored. This is a bootstrap
 * endpoint, not a general-purpose API — delete it after the first campaign
 * is created.
 */
import { prisma } from "@/lib/db/client";
import { generateReportShareSlug } from "@/lib/reports/share";

export async function GET() {
  try {
    const account = await prisma.instagramAccount.findFirst({
      orderBy: { connectedAt: "desc" },
      include: { workspace: true },
    });

    if (!account) {
      return json({ error: "No Instagram account found in DB" });
    }

    const existing = await prisma.automation.findFirst({
      where: { instagramAccountId: account.id },
    });

    if (existing) {
      return json({ message: "✅ Automation already exists", automation: existing });
    }

    const automation = await prisma.automation.create({
      data: {
        name: "Stoic Auto-Reply",
        goal: "Auto-reply to followers with a Stoic wisdom link",
        workspaceId: account.workspaceId,
        instagramAccountId: account.id,
        matchAnyPost: true,
        matchAnyWord: true,
        keywords: [],
        dmMessage: "Thanks for engaging {username}! Here's a Stoic thought for your sign. 🌿",
        dmTriggerEnabled: true,
        openingDmEnabled: true,
        openingDmMessage: "👋 Hey {username}! Thanks for the comment. Tap the button and I'll send over a Stoic reflection for your zodiac sign.",
        openingDmButtonLabel: "Send it! 🔮",
        linkButtonLabel: "Get Stoic Wisdom",
        followUpEnabled: true,
        followUpMessage: "Hope that resonated {username}! New posts every day — follow along for more Stoic × zodiac content. 🦁",
        followUpDelayMinutes: 30,
        publicReplyEnabled: true,
        publicReplyMessages: ["🌿 Thanks {username}! Check your DMs 🙏"],
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