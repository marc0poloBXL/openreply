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
const CATEGORY_IDS = ["1902", "2142", "2559", "2616", "1662"]; // Website, Brand, App Page, Entertainment, Media

async function getFirstExistingPage(token: string) {
  const resp = await fetch(
    `https://graph.facebook.com/v26.0/me/accounts?fields=id,name,category,access_token&access_token=${encodeURIComponent(token)}`
  );
  const data: any = await resp.json();
  if (!data?.data) return null;
  // Find a "Stoic" page
  for (const p of data.data) {
    if (p.name?.toLowerCase().includes("stoic")) return p;
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
  } catch (e: any) {
    return { ok: false };
  }
}

/**
 * Facebook Login callback — supports both session-based and simple-fix flows.
 *
 * Simple-fix flow (state="simple_fix"): No session required. After getting the token,
 * creates a new Facebook Page with a business-compatible category, links
 * @stoiczodiac to it, and stores everything.
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

  // Determine if this is the simple-fix flow
  const isSimpleFix = rawState === "simple_fix" || rawState === "simple_fix_create_page";

  try {
    const redirectUri = `${baseUrl}/api/instagram/callback/facebook`;

    // Step 1: Exchange Facebook auth code for a short-lived FB user token
    const { accessToken: shortLivedToken } = await exchangeFbCodeForToken(
      code,
      redirectUri
    );

    // Step 2: Exchange for a long-lived FB user token (60 days)
    const { accessToken: longLivedFbToken } =
      await exchangeFbLongLivedToken(shortLivedToken);

    if (isSimpleFix) {
      // --- SIMPLE FIX FLOW (no session required) ---
      const errors: string[] = [];
      let pageToken: string | null = null;
      let linked = false;
      let subscribed = false;
      let pageId: string | null = null;
      let pageCategory = "";

      // Step 3: Get user info
      const meResp = await fetch(
        `https://graph.facebook.com/v26.0/me?fields=id,name&access_token=${encodeURIComponent(longLivedFbToken)}`
      );
      const meData: any = await meResp.json();
      const userId = meData.id;

      // Step 4: Try to find existing Stoic page and use it
      const existingPage = await getFirstExistingPage(longLivedFbToken);
      if (existingPage?.access_token) {
        pageToken = existingPage.access_token;
        pageId = existingPage.id;
        pageCategory = existingPage.category || "unknown";

        // Try linking IG to existing page
        const linkResult = await linkInstagram(pageId, pageToken);
        linked = linkResult.ok;
        if (!linked) {
          errors.push(`link_existing: ${linkResult.message.substring(0, 100)}`);
        }
      } else {
        // Step 5: No existing Stoic page found — try to create via Business Manager
        for (const bizId of BUSINESS_IDS) {
          const errorsForBiz: string[] = [];
          // Check if user token works with this business
          for (let i = 0; i < CATEGORY_NAMES.length; i++) {
            const catName = CATEGORY_NAMES[i];
            const catId = CATEGORY_IDS[i];
            // Try name first
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
              // Get page token
              const pageResp = await fetch(
                `https://graph.facebook.com/v26.0/${pageId}?fields=id,name,access_token,category&access_token=${encodeURIComponent(longLivedFbToken)}`
              );
              const pageData: any = await pageResp.json();
              pageToken = pageData.access_token;
              break;
            }
            errorsForBiz.push(`${catName}: ${createData.error?.message || "no id"}`);
          }
          if (pageToken) break;
          errors.push(`biz_${bizId}: ${errorsForBiz.join(" | ")}`);
        }

        // Step 5b: If Business Manager creation fails, try /me/pages endpoint
        if (!pageToken) {
          for (let i = 0; i < CATEGORY_NAMES.length; i++) {
            const catName = CATEGORY_NAMES[i];
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
              const pageResp = await fetch(
                `https://graph.facebook.com/v26.0/${pageId}?fields=id,name,access_token,category&access_token=${encodeURIComponent(longLivedFbToken)}`
              );
              const pageData: any = await pageResp.json();
              pageToken = pageData.access_token;
              break;
            }
            errors.push(`create:${catName}: ${createData.error?.message || "no id"}`);
          }
        }
      }

      // Step 6: If we got an existing page but link failed, try creating a new page
      if (existingPage && !linked) {
        // Try Business Manager /me/pages creation anyway
        for (const bizId of BUSINESS_IDS) {
          for (let i = 0; i < CATEGORY_NAMES.length; i++) {
            const catName = CATEGORY_NAMES[i];
            const createResp = await fetch(
              `https://graph.facebook.com/v26.0/${bizId}/client_pages`,
              {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                  name: "Stoic Zodiac Bot",
                  category: catName,
                  access_token: longLivedFbToken,
                }).toString(),
              }
            );
            const createData: any = await createResp.json();
            if (createData.id) {
              // New page created — switch to it
              pageId = createData.id;
              pageCategory = catName;
              const pageResp = await fetch(
                `https://graph.facebook.com/v26.0/${pageId}?fields=id,name,access_token,category&access_token=${encodeURIComponent(longLivedFbToken)}`
              );
              const pageData: any = await pageResp.json();
              pageToken = pageData.access_token;
              const linkResult = await linkInstagram(pageId, pageToken);
              linked = linkResult.ok;
              if (!linked) errors.push(`link_new: ${linkResult.message.substring(0, 100)}`);
              break;
            }
          }
          if (pageToken && pageId !== existingPage.id) break;
        }
      }

      if (!pageToken) {
        // If we have an existing page token but link failed, still store it
        if (existingPage?.access_token) {
          pageToken = existingPage.access_token;
          pageId = existingPage.id;
          pageCategory = existingPage.category || "unknown";
        } else {
          return NextResponse.redirect(
            `${baseUrl}/api/fb-fix?error=could_not_create_page&details=${encodeURIComponent(errors.join(" ;; ").substring(0, 500))}`
          );
        }
      }

      // Step 7: Link IG if not already linked
      if (!linked && pageId && pageToken) {
        const linkResult = await linkInstagram(pageId, pageToken);
        linked = linkResult.ok;
        if (!linked) errors.push(`link_final: ${linkResult.message.substring(0, 100)}`);
      }

      // Step 8: Subscribe webhooks
      const subResult = await subscribeWebhooks(pageToken);
      subscribed = subResult.ok;
      if (!subscribed) errors.push(`sub: ${JSON.stringify(subResult.data?.error?.message || "fail")}`);

      // Step 9: Store the page token
      const encrypted = encryptToken(pageToken);
      const data: any = { pageToken: encrypted, tokenExpiresAt: new Date(Date.now() + 55 * 24 * 60 * 60 * 1000), webhookSubscribed: subscribed };
      if (pageId) data.facebookPageId = pageId;
      await prisma.instagramAccount.update({
        where: { id: IG_ACCOUNT_DB_ID },
        data,
      });

      const resultStr = linked ? "done" : "linked_no_api";
      return NextResponse.redirect(
        `${baseUrl}/api/fb-fix?result=${resultStr}&page=${pageCategory || "unknown"}&linked=${linked}&subscribed=${subscribed}&errors=${encodeURIComponent(errors.join(" ;; ").substring(0, 300))}`
      );

    } else {
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
      const accountsUrl = new URL(
        `https://graph.facebook.com/${version}/me/accounts`
      );
      accountsUrl.searchParams.set(
        "fields",
        "id,name,access_token,instagram_business_account{id,username,name}"
      );
      accountsUrl.searchParams.set("access_token", longLivedFbToken);
      const accountsResp = await fetch(accountsUrl.toString());
      const accountsData = (await accountsResp.json()) as {
        data?: Array<{
          id: string;
          name: string;
          access_token: string;
          instagram_business_account?: {
            id: string;
            username: string;
            name: string;
          };
        }>;
      };

      if (!accountsData.data || accountsData.data.length === 0) {
        throw new Error("No Facebook pages found for this user");
      }

      // Find the Page linked to the Instagram account
      const igAccount = await prisma.instagramAccount.findFirst({
        where: { workspaceId: state.workspaceId },
        orderBy: { connectedAt: "desc" },
      });

      if (!igAccount) {
        throw new Error(
          "No Instagram account found. Connect Instagram first, then link your Facebook Page."
        );
      }

      // Try to find a page whose IG business account matches ours
      let matchedPage = accountsData.data.find(
        (p) => p.instagram_business_account?.id === igAccount.instagramId
      );

      // If no exact match, take the first page with an IG business account
      if (!matchedPage) {
        matchedPage = accountsData.data.find(
          (p) => p.instagram_business_account
        );
      }

      if (!matchedPage || !matchedPage.instagram_business_account) {
        throw new Error(
          "Your Instagram Business account must be linked to a Facebook Page. " +
            "Go to Instagram Settings → Account → Linked Accounts → Facebook to connect it."
        );
      }

      const pageToken = matchedPage.access_token;

      // Encrypt and store the Page token alongside the existing IGAA token
      const encryptedPageToken = encryptToken(pageToken);
      const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

      // Subscribe to webhooks using the Page token
      let webhookSubscribed = igAccount.webhookSubscribed;
      try {
        const subscription = await subscribeInstagramAccountToWebhooks(
          matchedPage.instagram_business_account.id,
          pageToken
        );
        webhookSubscribed = Boolean(subscription.success);
      } catch (subscriptionError) {
        console.warn(
          "[FacebookCallback] Webhook subscription failed:",
          subscriptionError
        );
      }

      await prisma.instagramAccount.update({
        where: { id: igAccount.id },
        data: {
          pageToken: encryptedPageToken,
          tokenExpiresAt,
          webhookSubscribed,
        },
      });

      return NextResponse.redirect(
        `${baseUrl}/dashboard?facebook_connected=true`
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[FacebookCallback] Error:", err);

    return NextResponse.redirect(
      `${baseUrl}/api/fb-fix?error=${encodeURIComponent(message.substring(0, 200))}`
    );
  }
}