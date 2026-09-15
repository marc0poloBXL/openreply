/**
 * Force re-subscribe app-level webhook — uses app token to reset IG subscription
 */
import { NextResponse } from "next/server";

const FB_APP_ID = "1051360407668084";
const FB_APP_SECRET = process.env.FACEBOOK_APP_SECRET || "";
const CALLBACK_URL = "https://openreply-zeta-ruby.vercel.app/api/webhook";
const VERIFY_TOKEN = "stoiczodiac-webhook-2026";

export const dynamic = "force-dynamic";

export async function GET() {
  const steps: string[] = [];
  const appToken = `${FB_APP_ID}|${FB_APP_SECRET}`;

  try {
    // 1. Check current app subscriptions
    steps.push("Checking current app subscriptions...");
    const getResp = await fetch(
      `https://graph.facebook.com/v26.0/${FB_APP_ID}/subscriptions?access_token=${encodeURIComponent(appToken)}`
    );
    const getData: any = await getResp.json();
    steps.push("Current: " + JSON.stringify(getData).substring(0, 300));

    // 2. Delete the Instagram subscription
    steps.push("Deleting instagram subscription...");
    const delResp = await fetch(
      `https://graph.facebook.com/v26.0/${FB_APP_ID}/subscriptions`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          object: "instagram",
          access_token: appToken,
        }).toString(),
      }
    );
    const delData: any = await delResp.json();
    steps.push("Delete: " + JSON.stringify(delData).substring(0, 200));

    // 3. Re-create the Instagram subscription
    steps.push("Creating instagram subscription...");
    const postResp = await fetch(
      `https://graph.facebook.com/v26.0/${FB_APP_ID}/subscriptions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          object: "instagram",
          callback_url: CALLBACK_URL,
          verify_token: VERIFY_TOKEN,
          fields: "comments,messages",
          include_values: "true",
          access_token: appToken,
        }).toString(),
      }
    );
    const postData: any = await postResp.json();
    steps.push("Create: " + JSON.stringify(postData).substring(0, 300));

    // 4. Verify
    const verifyResp = await fetch(
      `https://graph.facebook.com/v26.0/${FB_APP_ID}/subscriptions?access_token=${encodeURIComponent(appToken)}`
    );
    const verifyData: any = await verifyResp.json();
    steps.push("Final: " + JSON.stringify(verifyData).substring(0, 300));

    return NextResponse.json({
      ok: Boolean(postData.success) || verifyData?.data?.length > 0,
      steps,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, steps });
  }
}