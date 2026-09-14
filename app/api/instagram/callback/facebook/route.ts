import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { subscribeInstagramAccountToWebhooks } from "@/lib/meta/client";
import {
  encryptToken,
  exchangeFbCodeForToken,
  exchangeFbLongLivedToken,
  verifyOAuthState,
} from "@/lib/meta/oauth";
import { canManageWorkspace } from "@/lib/workspace-access";

const IG_ID = "17841438935909153";
const IG_ACCOUNT_DB_ID = "cmtocgan5000004kzet71p0ka";

// Business Manager IDs from CLAUDE.md
const BUSINESS_IDS = ["2052016095704629", "5180791675279566", "9824014651061253"];

const CATEGORY_NAMES = ["Brand", "Website", "App Page", "Entertainment", "Media/News Company"];

function htmlPage(title: string, body: string): Response {
  return new Response(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:-apple-system,sans-serif;max-width:640px;margin:40px auto;padding:20px;line-height:1.5;background:#f5f5f5}
.card{background:white;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.08)}
h1{font-size:22px;margin:0 0 16px}pre{background:#f0f0f0;padding:12px;border-radius:8px;font-size:12px;overflow-x:auto;word-break:break-all;white-space:pre-wrap}
.btn{background:#1877F2;color:white;border:none;padding:12px 28px;border-radius:8px;font-size:16px;cursor:pointer;text-decoration:none;display:inline-block}
.error{border:2px solid #dc2626}.success{border:2px solid #16a34a}
p{color:#444}</style></head><body>${body}</body></html>`,
  { headers: { "content-type": "text/html" } });
}

async function findExistingPage(token: string, log: string[]) {
  // Try /me/accounts first (user's direct pages)
  const resp = await fetch(
    `https://graph.facebook.com/v26.0/me/accounts?fields=id,name,category,access_token&access_token=${encodeURIComponent(token)}`
  );
  const data: any = await resp.json();
  if (data?.data) {
    for (const p of data.data) {
      if (p.name?.toLowerCase().includes("stoic")) {
        log.push(`found: /me/accounts id=${p.id} cat=${p.category} has_token=${!!p.access_token}`);
        return p;
      }
    }
    log.push(`me/accounts_has_${data.data.length}_pages_no_stoic`);
  } else {
    log.push(`me/accounts: ${data?.error?.message || "no data"}`);
  }

  // Try each Business Manager's owned pages
  for (const bizId of BUSINESS_IDS) {
    try {
      const bizResp = await fetch(
        `https://graph.facebook.com/v26.0/${bizId}/owned_pages?fields=id,name,category,access_token&access_token=${encodeURIComponent(token)}`
      );
      const bizData: any = await bizResp.json();
      if (bizData?.data) {
        for (const p of bizData.data) {
          if (p.name?.toLowerCase().includes("stoic")) {
            log.push(`found: business_${bizId} id=${p.id} cat=${p.category} has_token=${!!p.access_token}`);
            return p;
          }
        }
        log.push(`biz_${bizId}_has_${bizData.data.length}_pages_no_stoic`);
      } else {
        log.push(`biz_${bizId}_owned_pages: ${bizData?.error?.message || "no data"}`);
      }
    } catch (e: any) {
      log.push(`biz_${bizId}_owned_pages_err: ${e.message}`);
    }
  }

  return null;
}

async function linkInstagram(pageId: string, pageToken: string): Promise<{ ok: boolean; message: string }> {
  const linkResp = await fetch(
    `https://graph.facebook.com/v26.0/${pageId}/instagram_accounts`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: pageToken, instagram_account_id: IG_ID }),
    }
  );
  const data: any = await linkResp.json();
  if (data.success) return { ok: true, message: "ok" };
  return { ok: false, message: data.error?.message || "unknown" };
}

async function subscribeWebhooks(token: string): Promise<{ ok: boolean; data?: any }> {
  try {
    const sub = await fetch(
      `https://graph.facebook.com/v26.0/${IG_ID}/subscribed_apps`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token, subscribed_fields: "comments,messages" }),
      }
    );
    const data: any = await sub.json();
    return { ok: Boolean(data.success), data };
  } catch {
    return { ok: false };
  }
}

/**
 * Facebook Login callback — supports both session-based and simple-fix flows.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const errorParam = request.nextUrl.searchParams.get("error");
  const rawState = request.nextUrl.searchParams.get("state");
  const baseUrl = getBaseUrl();

  if (errorParam) {
    return NextResponse.redirect(`${baseUrl}/api/fb-fix?error=denied`);
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/api/fb-fix?error=invalid`);
  }

  const isSimpleFix = rawState === "simple_fix" || rawState === "simple_fix_create_page";

  try {
    const redirectUri = `${baseUrl}/api/instagram/callback/facebook`;

    // Step 1: Exchange code for short-lived FB user token
    const { accessToken: shortLivedToken } = await exchangeFbCodeForToken(code, redirectUri);

    // Step 2: Exchange for long-lived FB user token (60 days)
    const { accessToken: longLivedFbToken } = await exchangeFbLongLivedToken(shortLivedToken);

    if (isSimpleFix) {
      const log: string[] = [];
      let pageToken: string | null = null;
      let linked = false;
      let subscribed = false;
      let pageId: string | null = null;
      let pageCategory = "";
      let existingPageUsed = false;

      // Step 3: Get user info
      const meResp = await fetch(
        `https://graph.facebook.com/v26.0/me?fields=id,name&access_token=${encodeURIComponent(longLivedFbToken)}`
      );
      const meData: any = await meResp.json();
      if (!meData.id) {
        return htmlPage("Error", `
          <div class="card error"><h1>❌ Facebook Login Issue</h1>
          <p>Could not get your Facebook user info.</p>
          <pre>${JSON.stringify(meData)}</pre>
          <a href="${baseUrl}/api/fb-fix" class="btn">Try Again</a></div>`);
      }
      log.push(`logged_in_as: ${meData.name} (${meData.id})`);

      // Step 4: Try to find existing Stoic page
      const existingPage = await findExistingPage(longLivedFbToken, log);
      if (existingPage?.access_token) {
        pageToken = existingPage.access_token;
        pageId = existingPage.id;
        pageCategory = existingPage.category || "unknown";
        existingPageUsed = true;
        log.push(`using_existing_page: ${pageId} cat=${pageCategory}`);

        const linkResult = await linkInstagram(pageId, pageToken);
        linked = linkResult.ok;
        log.push(`link_existing: ${linked ? "ok" : linkResult.message.substring(0, 150)}`);
      } else if (existingPage) {
        log.push(`existing_page_no_token: id=${existingPage.id}`);
      } else {
        log.push(`no_existing_stoic_page`);
      }

      // Step 5: If no page token yet, try creating a page
      if (!pageToken) {
        log.push(`attempting_page_creation...`);

        // Try Business Manager client_pages
        for (const bizId of BUSINESS_IDS) {
          const bizErrs: string[] = [];
          for (const catName of CATEGORY_NAMES) {
            try {
              const createResp = await fetch(
                `https://graph.facebook.com/v26.0/${bizId}/client_pages`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: new URLSearchParams({
                    name: "Stoic Zodiac",
                    category: catName,
                    access_token: longLivedFbToken,
                  }).toString(),
                }
              );
              const createData: any = await createResp.json();
              if (createData.id) {
                pageId = createData.id;
                pageCategory = catName;
                log.push(`created: biz_${bizId}/${catName} id=${pageId}`);
                const pageResp = await fetch(
                  `https://graph.facebook.com/v26.0/${pageId}?fields=id,name,access_token,category&access_token=${encodeURIComponent(longLivedFbToken)}`
                );
                const pageData: any = await pageResp.json();
                pageToken = pageData.access_token;
                log.push(`page_token_obtained: ${!!pageToken}`);
                break;
              }
              bizErrs.push(`${catName}: ${createData.error?.message || "no_id"}`);
            } catch (e: any) {
              bizErrs.push(`${catName}: ${e.message}`);
            }
          }
          if (pageToken) break;
          log.push(`biz_${bizId}_failed: ${bizErrs.join(" | ")}`);
        }

        // If Business Manager failed, try /me/pages
        if (!pageToken) {
          for (const catName of CATEGORY_NAMES) {
            try {
              const createResp = await fetch(
                `https://graph.facebook.com/v26.0/me/pages`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: new URLSearchParams({
                    name: "Stoic Zodiac",
                    category: catName,
                    access_token: longLivedFbToken,
                  }).toString(),
                }
              );
              const createData: any = await createResp.json();
              if (createData.id) {
                pageId = createData.id;
                pageCategory = catName;
                log.push(`created: me/pages/${catName} id=${pageId}`);
                const pageResp = await fetch(
                  `https://graph.facebook.com/v26.0/${pageId}?fields=id,name,access_token,category&access_token=${encodeURIComponent(longLivedFbToken)}`
                );
                const pageData: any = await pageResp.json();
                pageToken = pageData.access_token;
                break;
              }
              log.push(`me/pages_${catName}: ${createData.error?.message || "no_id"}`);
            } catch (e: any) {
              log.push(`me/pages_${catName}: ${e.message}`);
            }
          }
        }
      }

      if (!pageToken) {
        let errorHtml = `<div class="card error"><h1>❌ Could Not Get Page Token</h1>
          <p>All approaches failed. Here's a full log:</p>
          <pre>${log.join("\n")}</pre>`;

        // Try checking businesses the user has access to
        try {
          const bizCheck = await fetch(
            `https://graph.facebook.com/v26.0/${meData.id}/businesses?fields=id,name&access_token=${encodeURIComponent(longLivedFbToken)}`
          );
          const bizData: any = await bizCheck.json();
          errorHtml += `<p><strong>Your accessible businesses:</strong></p><pre>${JSON.stringify(bizData, null, 2)}</pre>`;
        } catch {}

        errorHtml += `<a href="${baseUrl}/api/fb-fix" class="btn" style="margin-top:16px">Try Again</a></div>`;
        return htmlPage("Error", errorHtml);
      }

      // Step 6: Link IG if not already linked
      if (!linked && pageId && pageToken) {
        const linkResult = await linkInstagram(pageId, pageToken);
        linked = linkResult.ok;
        log.push(`link_final: ${linkResult.ok ? "ok ⚠️" : linkResult.message.substring(0, 100)}`);
      }

      // Step 7: Subscribe webhooks
      const subResult = await subscribeWebhooks(pageToken);
      subscribed = subResult.ok;
      log.push(`webhook_subscribed: ${subscribed}`);

      // Step 8: Store the page token
      const encrypted = encryptToken(pageToken);
      const data: any = {
        pageToken: encrypted,
        tokenExpiresAt: new Date(Date.now() + 55 * 24 * 60 * 60 * 1000),
        webhookSubscribed: subscribed,
      };
      if (pageId) data.facebookPageId = pageId;
      await prisma.instagramAccount.update({ where: { id: IG_ACCOUNT_DB_ID }, data });
      log.push(`token_stored_in_db: true`);

      const successIcon = linked ? "✅" : "⚠️";
      const headerClass = linked ? "success" : "card";
      const title = linked ? "Comment Auto-Reply is FIXED!" : "Partial Fix — Token Stored";
      const subtitle = linked
        ? "Webhooks should now deliver comment events for auto-reply."
        : "IG API link failed but the page token is stored. Comment delivery depends on the existing IG↔FB page link.";

      return htmlPage("Result", `
        <div class="card ${headerClass}">
          <h1>${successIcon} ${title}</h1>
          <p>${subtitle}</p>
          <p>Page: <strong>${pageCategory || "unknown"}</strong> (${pageId})</p>
          <p>IG linked: ${linked ? "✅ Yes" : "❌ No"}</p>
          <p>Webhook subscribed: ${subscribed ? "✅ Yes" : "❌ No"}</p>
          <p>Used existing page: ${existingPageUsed ? "Yes" : "No (new)"}</p>
          <hr>
          <p style="font-size:12px;color:#888;"><strong>Operation log:</strong></p>
          <pre>${log.join("\n")}</pre>
          <a href="${baseUrl}/api/fix-all" class="btn" style="margin-top:12px">Check Full Status</a>
        </div>`);
    }

    // --- STANDARD FLOW (session required) ---
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.redirect(`${baseUrl}/login`);
    }

    const state = verifyOAuthState(rawState);
    if (!state) {
      return NextResponse.redirect(`${baseUrl}/settings?facebook=invalid_state`);
    }

    const membership = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: state.workspaceId,
        userId: session.user.id,
      },
    });

    if (!membership || !canManageWorkspace(membership.role)) {
      return NextResponse.redirect(`${baseUrl}/settings?facebook=forbidden`);
    }

    // Step 3: Get the pages linked to the user
    const version = process.env.META_GRAPH_API_VERSION ?? "v26.0";
    const accountsUrl = new URL(`https://graph.facebook.com/${version}/me/accounts`);
    accountsUrl.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username,name}");
    accountsUrl.searchParams.set("access_token", longLivedFbToken);
    const accountsResp = await fetch(accountsUrl.toString());
    const accountsData = (await accountsResp.json()) as {
      data?: Array<{
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string; username: string; name: string };
      }>;
    };

    if (!accountsData.data || accountsData.data.length === 0) {
      throw new Error("No Facebook pages found for this user");
    }

    const igAccount = await prisma.instagramAccount.findFirst({
      where: { workspaceId: state.workspaceId },
      orderBy: { connectedAt: "desc" },
    });

    if (!igAccount) {
      throw new Error("No Instagram account found. Connect Instagram first, then link your Facebook Page.");
    }

    let matchedPage = accountsData.data.find(
      (p) => p.instagram_business_account?.id === igAccount.instagramId
    );
    if (!matchedPage) {
      matchedPage = accountsData.data.find((p) => p.instagram_business_account);
    }

    if (!matchedPage || !matchedPage.instagram_business_account) {
      throw new Error(
        "Your Instagram Business account must be linked to a Facebook Page. " +
          "Go to Instagram Settings → Account → Linked Accounts → Facebook to connect it."
      );
    }

    const pageToken = matchedPage.access_token;
    const encryptedPageToken = encryptToken(pageToken);
    const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    let webhookSubscribed = igAccount.webhookSubscribed;
    try {
      const subscription = await subscribeInstagramAccountToWebhooks(
        matchedPage.instagram_business_account.id,
        pageToken
      );
      webhookSubscribed = Boolean(subscription.success);
    } catch (subscriptionError) {
      console.warn("[FacebookCallback] Webhook subscription failed:", subscriptionError);
    }

    await prisma.instagramAccount.update({
      where: { id: igAccount.id },
      data: { pageToken: encryptedPageToken, tokenExpiresAt, webhookSubscribed },
    });

    return NextResponse.redirect(`${baseUrl}/dashboard?facebook_connected=true`);

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[FacebookCallback] Error:", err);

    if (rawState?.startsWith("simple_fix")) {
      return htmlPage("Error", `
        <div class="card error"><h1>❌ Error</h1>
        <p>${message.replace(/</g, "&lt;").substring(0, 500)}</p>
        <a href="${baseUrl}/api/fb-fix" class="btn" style="margin-top:16px">Try Again</a></div>`);
    }

    return NextResponse.redirect(
      `${baseUrl}/api/fb-fix?error=${encodeURIComponent(message.substring(0, 200))}`
    );
  }
}// force-redeploy Mon, Sep 14, 2026  3:48:36 PM
