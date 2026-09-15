/**
 * Force re-subscribe BOTH app-level AND IG-level webhook subscriptions
 *
 * App-level: uses app token (app_id|app_secret) to reset IG object subscription
 * IG-level: uses IGAA token (from DB) to reset /{ig-id}/subscribed_apps
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";

const FB_APP_ID = "1051360407668084";
const FB_APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";
const IG_ID = "17841438935909153";
const CALLBACK_URL = "https://openreply-zeta-ruby.vercel.app/api/webhook";
const VERIFY_TOKEN = "stoiczodiac-webhook-2026";

export const dynamic = "force-dynamic";

async function fetchGraph(url: string, body?: Record<string, string>) {
  const opts: RequestInit = { method: body ? "POST" : "GET", headers: {} };
  if (body) {
    opts.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    opts.body = new URLSearchParams(body).toString();
  }
  const r = await fetch(url, opts);
  return { status: r.status, body: await r.json() };
}

export async function GET() {
  const steps: string[] = [];
  const appToken = `${FB_APP_ID}|${FB_APP_SECRET}`;

  try {
    // ===== PART 1: App-level subscription (object=instagram) =====
    steps.push("--- PART 1: APP-LEVEL ---");

    steps.push("Checking current app subscriptions...");
    const get1 = await fetchGraph(
      `https://graph.facebook.com/v26.0/${FB_APP_ID}/subscriptions?access_token=${encodeURIComponent(appToken)}`
    );
    steps.push("Current: " + JSON.stringify(get1.body).substring(0, 300));

    steps.push("Deleting instagram subscription...");
    const del1 = await fetchGraph(
      `https://graph.facebook.com/v26.0/${FB_APP_ID}/subscriptions`,
      { object: "instagram", access_token: appToken }
    );
    steps.push("Delete: " + JSON.stringify(del1.body).substring(0, 200));

    steps.push("Creating instagram subscription...");
    const post1 = await fetchGraph(
      `https://graph.facebook.com/v26.0/${FB_APP_ID}/subscriptions`,
      {
        object: "instagram",
        callback_url: CALLBACK_URL,
        verify_token: VERIFY_TOKEN,
        fields: "comments,messages",
        include_values: "true",
        access_token: appToken,
      }
    );
    steps.push("Create: " + JSON.stringify(post1.body).substring(0, 300));

    // ===== PART 2: IG-level subscription (/{ig-id}/subscribed_apps) =====
    steps.push("--- PART 2: IG-LEVEL ---");

    // Read IGAA token from DB
    const account = await prisma.instagramAccount.findFirst({
      where: { instagramId: IG_ID },
      orderBy: { connectedAt: "desc" },
    });

    if (account?.accessToken) {
      const igaaToken = decryptToken(account.accessToken);
      steps.push("IGAA token found, prefix: " + igaaToken.substring(0, 20));

      // Delete existing IG-level subscription
      steps.push("Deleting IG-level subscription...");
      const del2 = await fetchGraph(
        `https://graph.instagram.com/v21.0/${IG_ID}/subscribed_apps`,
        { access_token: igaaToken }
      );
      steps.push("IG Delete: " + JSON.stringify(del2.body).substring(0, 200));

      // Create fresh IG-level subscription
      steps.push("Creating IG-level subscription...");
      const post2 = await fetchGraph(
        `https://graph.instagram.com/v21.0/${IG_ID}/subscribed_apps`,
        { access_token: igaaToken, subscribed_fields: "comments,messages" }
      );
      steps.push("IG Create: " + JSON.stringify(post2.body).substring(0, 300));

      // Verify
      const get2 = await fetchGraph(
        `https://graph.instagram.com/v21.0/${IG_ID}/subscribed_apps?access_token=${encodeURIComponent(igaaToken)}`
      );
      steps.push("IG Verify: " + JSON.stringify(get2.body).substring(0, 300));
    } else {
      steps.push("No IGAA token found in DB — skipping IG-level subscription reset");
    }

    // ===== PART 3: Final verification =====
    steps.push("--- PART 3: VERIFY FB APP ---");
    const finalGet = await fetchGraph(
      `https://graph.facebook.com/v26.0/${FB_APP_ID}/subscriptions?access_token=${encodeURIComponent(appToken)}`
    );
    steps.push("Final: " + JSON.stringify(finalGet.body).substring(0, 300));

    const ok = Boolean(post1.body?.success) || finalGet.body?.data?.length > 0;
    return NextResponse.json({ ok, steps });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, steps });
  }
}