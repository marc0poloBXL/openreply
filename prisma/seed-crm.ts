/**
 * Seed CRM: creates a default birthday reading followup campaign.
 *
 * Run: npx tsx prisma/seed-crm.ts
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}
const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

const CAMPAIGN_NAME = "Birthday Reading Upsell";
const TRIGGER_EVENT = "birthday_reading_requested";

async function main() {
  // Check if campaign already exists
  const existing = await prisma.followupCampaign.findFirst({
    where: { name: CAMPAIGN_NAME },
  });
  if (existing) {
    console.log(`Campaign "${CAMPAIGN_NAME}" already exists (id=${existing.id}). Skipping.`);
    return;
  }

  const campaign = await prisma.followupCampaign.create({
    data: {
      name: CAMPAIGN_NAME,
      triggerEvent: TRIGGER_EVENT,
      description:
        "Free birthday reading → upsell to full natal-chart reading. " +
        "Sends 3 emails over 14 days with increasing urgency.",
      isActive: true,
      steps: {
        create: [
          {
            stepNumber: 1,
            type: "WAIT",
            waitDays: 0,
            isActive: true,
          },
          {
            stepNumber: 2,
            type: "WAIT",
            waitDays: 2,
            isActive: true,
          },
          {
            stepNumber: 3,
            type: "EMAIL",
            waitDays: 0,
            emailSubject: "Go Deeper: Your Full Stoic Birth Chart",
            emailBody: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
<h2 style="color:#2c2a26">Your free reading was just the beginning</h2>
<p style="color:#444;line-height:1.6">
  The blueprint you received was based on your birth date alone. A full natal-chart
  reading adds your <strong>exact birth time</strong> and <strong>birthplace</strong> to reveal:
</p>
<ul style="color:#444;line-height:1.8">
  <li>The timing of your life's major cycles</li>
  <li>Which Stoic virtue each season asks of you</li>
  <li>Your sign's complete archetype — not just the surface</li>
</ul>
<p style="color:#444;line-height:1.6">
  Get your complete 12-page Stoic Birth Chart for just $27.
</p>
<a href="{{unsubscribe_url}}?upgrade=true" style="display:inline-block;background:#b8860b;color:#fff;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;margin:8px 0">
  Get Your Full Reading — $27
</a>
<p style="font-size:12px;color:#8a8176;margin-top:20px">
  <a href="{{unsubscribe_url}}">Unsubscribe</a>
</p>
</div>`,
            isActive: true,
          },
          {
            stepNumber: 4,
            type: "WAIT",
            waitDays: 4,
            isActive: true,
          },
          {
            stepNumber: 5,
            type: "EMAIL",
            waitDays: 0,
            emailSubject: "✨ Last chance — your full reading is waiting",
            emailBody: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
<h2 style="color:#2c2a26">Your birth chart holds more than you've seen</h2>
<p style="color:#444;line-height:1.6">
  The Stoics believed self-knowledge is the foundation of wisdom. Your full
  natal-chart reading — with birth time and birthplace — reveals the timing
  of your strengths, challenges, and growth periods.
</p>
<p style="color:#444;line-height:1.6">
  <strong>This week only:</strong> Get the complete 12-page reading for $27
  (regularly $47).
</p>
<a href="{{unsubscribe_url}}?upgrade=true" style="display:inline-block;background:#b8860b;color:#fff;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;margin:8px 0">
  Unlock Your Full Reading — $27
</a>
<p style="font-size:12px;color:#8a8176;margin-top:20px">
  <a href="{{unsubscribe_url}}">Unsubscribe</a>
</p>
</div>`,
            isActive: true,
          },
          {
            stepNumber: 6,
            type: "WAIT",
            waitDays: 7,
            isActive: true,
          },
          {
            stepNumber: 7,
            type: "EMAIL",
            waitDays: 0,
            emailSubject: "Your Stoic Birth Chart is ready to unlock",
            emailBody: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
<h2 style="color:#2c2a26">Still thinking about it?</h2>
<p style="color:#444;line-height:1.6">
  Your free reading gave you the archetype. The full reading — with birth time
  and birthplace — adds the life map: when to act, when to prepare, and which
  virtue each chapter of your life calls on.
</p>
<p style="color:#444;line-height:1.6">
  No rush — the offer stands whenever you're ready.
</p>
<a href="{{unsubscribe_url}}?upgrade=true" style="display:inline-block;background:#b8860b;color:#fff;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;margin:8px 0">
  Get Your Full Reading
</a>
<p style="font-size:12px;color:#8a8176;margin-top:20px">
  <a href="{{unsubscribe_url}}">Unsubscribe</a>
</p>
</div>`,
            isActive: true,
          },
        ],
      },
    },
    include: { steps: true },
  });

  console.log(`Created campaign "${CAMPAIGN_NAME}" with ${campaign.steps.length} steps:`);
  for (const step of campaign.steps) {
    console.log(`  Step ${step.stepNumber}: ${step.type} ${step.emailSubject ? `"${step.emailSubject}"` : `wait ${step.waitDays}d`}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());