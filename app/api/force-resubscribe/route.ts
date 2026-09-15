/**
 * Force re-subscribe the Instagram webhook — one-time fix endpoint
 * 1. Deletes existing IG subscription
 * 2. Creates fresh subscription with comments,messages
 * Uses the IGAA token from the DB (server-side only)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";

const IG_ID = "17841438935909153";

export async function GET() {
  const steps: string[] = [];

  try {
    // 1. Read IGAA token from DB
    steps.push("Reading IGAA token from DB...");
    const account = await prisma.instagramAccount.findFirst({
      where: { instagramId: IG_ID },
      orderBy: { connectedAt: "desc" },
    });

    if (!account?.accessToken) {
      return NextResponse.json({ ok: false, error: "No IGAA token in DB", steps });
    }

    let igaaToken: string;
    try {
      igaaToken = decryptToken(account.accessToken);
    } catch {
      return NextResponse.json({ ok: false, error: "Failed to decrypt token", steps });
    }
    steps.push("IGAA token decrypted (" + igaaToken.length + " chars)");

    // 2. First check current subscription status
    const checkResp = await fetch(
      "https://graph.facebook.com/v26.0/" + IG_ID + "/subscribed_apps?access_token=" + encodeURIComponent(igaaToken)
    );
    const checkData: any = await checkResp.json();
    steps.push("Current subscription: " + JSON.stringify(checkData).substring(0, 200));

    // 3. DELETE the existing subscription
    steps.push("Deleting existing subscription...");
    const deleteResp = await fetch(
      "https://graph.facebook.com/v26.0/" + IG_ID + "/subscribed_apps",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: igaaToken }),
      }
    );
    const deleteData: any = await deleteResp.json();
    steps.push("Delete result: " + JSON.stringify(deleteData).substring(0, 200));

    // 4. Wait a moment for propagation
    await new Promise(r => setTimeout(r, 1000));

    // 5. Create fresh subscription
    steps.push("Creating fresh subscription...");
    const subResp = await fetch(
      "https://graph.facebook.com/v26.0/" + IG_ID + "/subscribed_apps",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: igaaToken, subscribed_fields: "comments,messages" }),
      }
    );
    const subData: any = await subResp.json();
    steps.push("Subscription result: " + JSON.stringify(subData).substring(0, 200));

    // 6. Verify
    const verifyResp = await fetch(
      "https://graph.facebook.com/v26.0/" + IG_ID + "/subscribed_apps?access_token=" + encodeURIComponent(igaaToken)
    );
    const verifyData: any = await verifyResp.json();
    steps.push("Verification: " + JSON.stringify(verifyData).substring(0, 200));

    const ok = Boolean(subData.success);
    return NextResponse.json({ ok, steps, subscription: subData });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, steps });
  }
}