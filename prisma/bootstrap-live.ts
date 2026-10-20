/**
 * Bootstrap the live environment after a database migration (e.g.
 * Neon -> Supabase). The schema migrates but the data does not, so this
 * recreates the minimum rows the live features need:
 *
 *   1. Owner user (Marc) + "Stoic Zodiac" workspace + OWNER membership
 *   2. InstagramAccount placeholder row for @stoiczodiac (token itself is
 *      stored by the "Connect Instagram" OAuth flow)
 *   3. The "LINK" Automation (comment LINK -> DM with the quiz link) — this
 *      is what the worker's dm-worker matches on
 *   4. A "Leads" workspace + prints its id, so LEADS_WORKSPACE_ID can be set
 *      in .env and birthday-reading/quiz leads land in a workspace
 *
 * Everything is idempotent: rows already present are left untouched.
 *
 * Run: npx tsx prisma/bootstrap-live.ts
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}
const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

// Known identity of the @stoiczodiac Instagram account (from CLAUDE.md).
const OWNER_EMAIL = "owner@stoiczodiac.com";
const OWNER_NAME = "Stoic Zodiac Owner";
const WORKSPACE_NAME = "Stoic Zodiac";
const LEADS_WORKSPACE_NAME = "Leads";
const IG_INSTAGRAM_ID = "17841438935909153";
const IG_USERNAME = "stoiczodiac";
const IG_NAME = "Stoic Zodiac";
const QUIZ_URL = "https://openreply-zeta-ruby.vercel.app/quiz";

async function main() {
  console.log("→ Bootstrapping live database…");

  // 1. Owner + workspace + OWNER membership (FK order: User -> Workspace -> Member)
  let owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (!owner) {
    owner = await prisma.user.create({
      data: { email: OWNER_EMAIL, name: OWNER_NAME },
    });
    console.log(`  + owner user ${owner.id} (${OWNER_EMAIL})`);
  } else {
    console.log(`  = owner user already exists (${owner.id})`);
  }

  let workspace = await prisma.workspace.findFirst({
    where: { name: WORKSPACE_NAME },
  });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: WORKSPACE_NAME,
        ownerId: owner.id,
        members: { create: { userId: owner.id, role: "OWNER" } },
      },
    });
    console.log(`  + workspace "${WORKSPACE_NAME}" ${workspace.id}`);
  } else {
    console.log(`  = workspace "${WORKSPACE_NAME}" already exists (${workspace.id})`);
  }

  // 2. InstagramAccount placeholder (token filled in by the OAuth flow)
  let account = await prisma.instagramAccount.findUnique({
    where: { instagramId: IG_INSTAGRAM_ID },
  });
  if (!account) {
    account = await prisma.instagramAccount.create({
      data: {
        workspaceId: workspace.id,
        instagramId: IG_INSTAGRAM_ID,
        username: IG_USERNAME,
        name: IG_NAME,
        // Placeholder so the row exists with a valid FK; the "Connect
        // Instagram" flow replaces it with the real encrypted token.
        accessToken: "__pending_connect__",
      },
    });
    console.log(`  + instagramAccount @${IG_USERNAME} (${account.id})`);
  } else {
    console.log(`  = instagramAccount @${IG_USERNAME} already exists (${account.id})`);
  }

  // 3. The "LINK" automation — comment LINK -> DM with the quiz link
  const existingAutomation = await prisma.automation.findFirst({
    where: { name: "LINK — Birthday Reading" },
  });
  if (!existingAutomation) {
    await prisma.automation.create({
      data: {
        workspaceId: workspace.id,
        instagramAccountId: account.id,
        name: "LINK — Birthday Reading",
        goal: "Birthday reading lead",
        matchAnyPost: true, // any post; keyword LINK in the comment triggers it
        keywords: ["LINK"],
        wholeWordMatch: true,
        dmTriggerEnabled: true, // also fires when a DM says link
        dmMessage: `Hey {username}! 🎂 Here is your free Stoic birthday reading: ${QUIZ_URL}`,
        openingDmEnabled: true,
        openingDmMessage: `Hey {username}! Thanks for the comment — here's your free Stoic birthday reading 🎂`,
        openingDmButtonLabel: "Get My Reading",
        isActive: true,
        publicReplyEnabled: true,
        publicReplyMessage: "Check your DMs 📩",
      },
    });
    console.log(`  + automation "LINK — Birthday Reading" (matchAnyPost, keywords: [LINK])`);
  } else {
    console.log(`  = automation "LINK — Birthday Reading" already exists`);
  }

  // 4. Leads workspace — print id for LEADS_WORKSPACE_ID in .env
  let leads = await prisma.workspace.findFirst({
    where: { name: LEADS_WORKSPACE_NAME },
  });
  if (!leads) {
    leads = await prisma.workspace.create({
      data: {
        name: LEADS_WORKSPACE_NAME,
        ownerId: owner.id,
        members: { create: { userId: owner.id, role: "OWNER" } },
      },
    });
    console.log(`  + workspace "${LEADS_WORKSPACE_NAME}" ${leads.id}`);
  } else {
    console.log(`  = workspace "${LEADS_WORKSPACE_NAME}" already exists (${leads.id})`);
  }

  console.log("\n════════════════════════════════════════════════════");
  console.log("✅ Bootstrap complete");
  console.log(`  IG account id: ${account.id}`);
  console.log(`  Workspace id:  ${workspace.id}`);
  console.log(`  Leads ws id:   ${leads.id}`);
  console.log("\nAdd this to .env (and Vercel env) so birthday-reading");
  console.log("and quiz leads land in a dashboard workspace:");
  console.log(`  LEADS_WORKSPACE_ID=${leads.id}`);
  console.log("════════════════════════════════════════════════════\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("Bootstrap failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });