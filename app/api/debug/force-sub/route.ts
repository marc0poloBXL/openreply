import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";

const IG_ID = "17841438935909153";
const PAGE_ID = "1229304876940609";
const MEDIA_ID = "18085664627243598";

export const maxDuration = 60;

export async function GET() {
  const APP_TOKEN = `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;
  const account = await prisma.instagramAccount.findFirst({ orderBy: { connectedAt: "desc" } });
  if (!account) return json({ error: "No account" });

  const igaaToken = account.accessToken ? decryptToken(account.accessToken) : null;
  const pageToken = account.pageToken ? decryptToken(account.pageToken) : null;
  const log: Record<string, unknown> = {};

  async function trySubscribe(label: string, baseUrl: string, token: string) {
    try {
      const r = await fetch(`${baseUrl}/${IG_ID}/subscribed_apps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token, subscribed_fields: ["comments", "messages"] }),
      });
      log[`sub_${label}`] = await r.json();
    } catch (e: any) { log[`sub_${label}`] = { error: e.message }; }
  }

  if (igaaToken) {
    await trySubscribe("igaa_on_instagram", "https://graph.instagram.com/v25.0", igaaToken);
    await trySubscribe("igaa_on_facebook", "https://graph.facebook.com/v26.0", igaaToken);
  }
  if (pageToken) await trySubscribe("page_on_facebook", "https://graph.facebook.com/v26.0", pageToken);
  await trySubscribe("app_on_facebook", "https://graph.facebook.com/v26.0", APP_TOKEN);

  // App-level subscription refresh
  try {
    const params = new URLSearchParams({
      access_token: APP_TOKEN,
      object: "instagram",
      callback_url: "https://openreply-zeta-ruby.vercel.app/api/webhook",
      verify_token: "stoiczodiac-webhook-2026",
      fields: "comments,messages",
      include_values: "true",
    });
    const appSub = await fetch("https://graph.facebook.com/v26.0/1051360407668084/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    log.app_level_sub = await appSub.json();
  } catch (e: any) { log.app_level_sub = { error: e.message }; }

  // Try reading comments from the post the user commented on
  async function tryComments(label: string, url: string) {
    try {
      const r = await fetch(url);
      log[`comments_${label}`] = (await r.json());
    } catch (e: any) { log[`comments_${label}`] = { error: e.message }; }
  }

  if (igaaToken) {
    await tryComments("igaa_v25", `https://graph.instagram.com/v25.0/${MEDIA_ID}/comments?fields=id,text,timestamp,from{id,username}&access_token=${encodeURIComponent(igaaToken)}`);
    await tryComments("igaa_v22", `https://graph.instagram.com/v22.0/${MEDIA_ID}/comments?fields=id,text,timestamp&access_token=${encodeURIComponent(igaaToken)}`);
    await tryComments("igaa_v21", `https://graph.instagram.com/v21.0/${MEDIA_ID}/comments?fields=id,text,timestamp&access_token=${encodeURIComponent(igaaToken)}`);
    await tryComments("ig_media_fb", `https://graph.facebook.com/v26.0/${IG_ID}/media?fields=id,comments_count&access_token=${encodeURIComponent(igaaToken)}`);
  }
  if (pageToken) {
    await tryComments("page_fb", `https://graph.facebook.com/v26.0/${MEDIA_ID}/comments?fields=id,text,from{id,name},timestamp&access_token=${encodeURIComponent(pageToken)}`);
    await tryComments("ig_media_page", `https://graph.facebook.com/v26.0/${IG_ID}/media?fields=id,comments_count&access_token=${encodeURIComponent(pageToken)}`);
  }
  await tryComments("app_fb", `https://graph.facebook.com/v26.0/${MEDIA_ID}/comments?fields=id,text,from{id,name},timestamp&access_token=${APP_TOKEN}`);

  // Check if page link status changed
  if (pageToken) {
    try {
      const r = await fetch(`https://graph.facebook.com/v26.0/${PAGE_ID}?fields=id,name,instagram_business_account{id,username},connected_instagram_account{id,username}&access_token=${encodeURIComponent(pageToken)}`);
      log.page_link_check = await r.json();
    } catch (e: any) { log.page_link_check = { error: e.message }; }
  }

  return json(log);
}

function json(d: unknown) {
  return new Response(JSON.stringify(d, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}