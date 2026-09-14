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

const IG_ID = process.env.INSTAGRAM_ACCOUNT_ID || "17841438935909153";
const IG_USERNAME = "stoiczodiac";

const CATEGORY_NAMES = ["Brand", "Website", "App Page", "Entertainment", "Media/News Company"];

function htmlPage(title: string, body: string): Response {
  const lines = [
    '<!DOCTYPE html>',
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title>',
    '<style>body{font-family:-apple-system,sans-serif;max-width:640px;margin:40px auto;padding:20px;line-height:1.5;background:#f5f5f5}',
    '.card{background:white;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.08)}',
    'h1{font-size:22px;margin:0 0 16px}pre{background:#f0f0f0;padding:12px;border-radius:8px;font-size:12px;overflow-x:auto;word-break:break-all;white-space:pre-wrap}',
    '.btn{background:#1877F2;color:white;border:none;padding:12px 28px;border-radius:8px;font-size:16px;cursor:pointer;text-decoration:none;display:inline-block}',
    '.error{border:2px solid #dc2626}.success{border:2px solid #16a34a}',
    'p{color:#444}</style></head><body>' + body + '</body></html>'
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/html" } });
}

async function discoverBusinessIds(token: string): Promise<string[]> {
  try {
    const resp = await fetch(
      "https://graph.facebook.com/v26.0/me/businesses?fields=id,name&access_token=" + encodeURIComponent(token)
    );
    const data: any = await resp.json();
    if (data?.data) {
      return data.data.map((b: any) => b.id);
    }
  } catch {}
  return [];
}

async function findExistingPage(token: string, log: string[]) {
  const resp = await fetch(
    "https://graph.facebook.com/v26.0/me/accounts?fields=id,name,category,access_token&access_token=" + encodeURIComponent(token)
  );
  const data: any = await resp.json();
  if (data?.data) {
    for (const p of data.data) {
      if (p.name?.toLowerCase().includes("stoic")) {
        log.push("found: /me/accounts id=" + p.id + " cat=" + p.category + " has_token=" + !!p.access_token);
        return p;
      }
    }
    log.push("me/accounts has " + data.data.length + " pages, no Stoic");
  } else {
    log.push("me/accounts: " + (data?.error?.message || "no data"));
  }

  const bizIds = await discoverBusinessIds(token);
  for (const bizId of bizIds) {
    try {
      const pagesResp = await fetch(
        "https://graph.facebook.com/v26.0/" + bizId + "/owned_pages?fields=id,name,category,access_token&access_token=" + encodeURIComponent(token)
      );
      const pagesData: any = await pagesResp.json();
      if (pagesData?.data) {
        for (const p of pagesData.data) {
          if (p.name?.toLowerCase().includes("stoic")) {
            log.push("found: business " + bizId + " id=" + p.id + " cat=" + p.category);
            return p;
          }
        }
        log.push("biz " + bizId + " has " + pagesData.data.length + " pages, no Stoic");
      }
    } catch (e: any) {
      log.push("biz " + bizId + " err: " + e.message);
    }
  }

  return null;
}

async function linkInstagram(pageId: string, pageToken: string): Promise<{ ok: boolean; message: string }> {
  const linkResp = await fetch(
    "https://graph.facebook.com/v26.0/" + pageId + "/instagram_accounts",
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

async function subscribeWebhooks(token: string): Promise<{ ok: boolean }> {
  try {
    const sub = await fetch(
      "https://graph.facebook.com/v26.0/" + IG_ID + "/subscribed_apps",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token, subscribed_fields: "comments,messages" }),
      }
    );
    const data: any = await sub.json();
    return { ok: Boolean(data.success) };
  } catch {
    return { ok: false };
  }
}

async function tryCreatePage(token: string, log: string[]): Promise<{ id: string; name: string } | null> {
  const bizIds = await discoverBusinessIds(token);
  for (const bizId of bizIds) {
    log.push("trying biz " + bizId);
    for (const cat of CATEGORY_NAMES) {
      try {
        const createResp = await fetch(
          "https://graph.facebook.com/v26.0/" + bizId + "/client_pages",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ name: "Stoic Zodiac", category: cat, access_token: token }).toString(),
          }
        );
        const createData: any = await createResp.json();
        if (createData.id) {
          log.push("created: biz " + bizId + "/" + cat + " id=" + createData.id);
          return { id: createData.id, name: cat };
        }
        log.push("biz " + bizId + "/" + cat + ": " + (createData.error?.message || "no id"));
      } catch (e: any) {
        log.push("biz " + bizId + "/" + cat + ": " + e.message);
      }
    }
  }

  // Fallback: try /me/pages
  for (const cat of CATEGORY_NAMES) {
    try {
      const createResp = await fetch(
        "https://graph.facebook.com/v26.0/me/pages",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ name: "Stoic Zodiac", category: cat, access_token: token }).toString(),
        }
      );
      const createData: any = await createResp.json();
      if (createData.id) {
        log.push("created: me/pages/" + cat + " id=" + createData.id);
        return { id: createData.id, name: cat };
      }
      log.push("me/pages/" + cat + ": " + (createData.error?.message || "no id"));
    } catch (e: any) {
      log.push("me/pages/" + cat + ": " + e.message);
    }
  }

  return null;
}

/**
 * Facebook Login callback — supports both session-based and simple-fix flows.
 * v2 — uses upsert for DB, findFirst fallback, runtime business discovery
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const errorParam = request.nextUrl.searchParams.get("error");
  const rawState = request.nextUrl.searchParams.get("state");
  const baseUrl = getBaseUrl();

  if (errorParam) {
    return NextResponse.redirect(baseUrl + "/api/fb-fix?error=denied");
  }

  if (!code) {
    return NextResponse.redirect(baseUrl + "/api/fb-fix?error=invalid");
  }

  const isSimpleFix = rawState === "simple_fix" || rawState === "simple_fix_create_page";

  try {
    const redirectUri = baseUrl + "/api/instagram/callback/facebook";

    const { accessToken: shortLivedToken } = await exchangeFbCodeForToken(code, redirectUri);
    const { accessToken: longLivedFbToken } = await exchangeFbLongLivedToken(shortLivedToken);

    if (isSimpleFix) {
      const log: string[] = [];
      let pageToken: string | null = null;
      let linked = false;
      let subscribed = false;
      let pageId: string | null = null;
      let pageCategory = "";
      let existingPageUsed = false;

      const meResp = await fetch(
        "https://graph.facebook.com/v26.0/me?fields=id,name&access_token=" + encodeURIComponent(longLivedFbToken)
      );
      const meData: any = await meResp.json();
      if (!meData.id) {
        return htmlPage("Error",
          '<div class="card error"><h1>Facebook Login Issue</h1><p>Could not get your user info.</p><pre>' +
          JSON.stringify(meData) + '</pre><a href="' + baseUrl + '/api/fb-fix" class="btn" style="margin-top:16px">Try Again</a></div>');
      }
      log.push("logged in as: " + meData.name + " (" + meData.id + ")");

      const existingPage = await findExistingPage(longLivedFbToken, log);
      if (existingPage?.access_token) {
        pageToken = existingPage.access_token;
        pageId = existingPage.id;
        pageCategory = existingPage.category || "unknown";
        existingPageUsed = true;
        log.push("using existing page: " + pageId + " cat=" + pageCategory);

        const linkResult = await linkInstagram(pageId as string, pageToken as string);
        linked = linkResult.ok;
        log.push("link existing: " + (linked ? "ok" : linkResult.message.substring(0, 150)));
      } else if (existingPage) {
        log.push("existing page has no token: " + existingPage.id);
      } else {
        log.push("no existing Stoic page found");
      }

      if (!pageToken) {
        log.push("attempting page creation...");
        const created = await tryCreatePage(longLivedFbToken, log);
        if (created) {
          pageId = created.id;
          pageCategory = created.name;
          const pageResp = await fetch(
            "https://graph.facebook.com/v26.0/" + created.id + "?fields=id,name,access_token,category&access_token=" + encodeURIComponent(longLivedFbToken)
          );
          const pageData: any = await pageResp.json();
          pageToken = pageData.access_token;
          log.push("page token obtained: " + !!pageToken);
        }
      }

      if (!pageToken) {
        let errorHtml = '<div class="card error"><h1>Could Not Get Page Token</h1><p>All approaches failed:</p><pre>' + log.join("\n") + '</pre>'
          + '<a href="' + baseUrl + '/api/fb-fix" class="btn" style="margin-top:16px">Try Again</a></div>';
        return htmlPage("Error", errorHtml);
      }

      if (!linked && pageId && pageToken) {
        const linkResult = await linkInstagram(pageId, pageToken);
        linked = linkResult.ok;
        log.push("link final: " + (linkResult.ok ? "ok" : linkResult.message.substring(0, 100)));
      }

      const subResult = await subscribeWebhooks(pageToken);
      subscribed = subResult.ok;
      log.push("webhook subscribed: " + subscribed);

      const encrypted = encryptToken(pageToken);
      const tokenExp = new Date(Date.now() + 55 * 24 * 60 * 60 * 1000);
      const updateData: any = {
        pageToken: encrypted,
        tokenExpiresAt: tokenExp,
        webhookSubscribed: subscribed,
      };
      if (pageId) updateData.facebookPageId = pageId;

      // Use upsert so it creates a record if none exists
      try {
        await prisma.instagramAccount.upsert({
          where: { instagramId: IG_ID },
          create: {
            instagramId: IG_ID,
            username: IG_USERNAME,
            accessToken: "",
            workspaceId: "default",
            pageToken: encrypted,
            tokenExpiresAt: tokenExp,
            webhookSubscribed: subscribed,
            ...(pageId ? { facebookPageId: pageId } : {}),
          },
          update: updateData,
        });
        log.push("token saved via upsert");
      } catch (dbErr: any) {
        log.push("upsert failed: " + (dbErr.message || "unknown").substring(0, 150));
        // Last resort: try to find any record by any criteria
        try {
          const anyRecord = await prisma.instagramAccount.findFirst({ orderBy: { connectedAt: "desc" } });
          if (anyRecord) {
            await prisma.instagramAccount.update({ where: { id: anyRecord.id }, data: updateData });
            log.push("token saved via fallback (id=" + anyRecord.id + ")");
          }
        } catch (fallbackErr: any) {
          log.push("fallback also failed: " + (fallbackErr.message || "").substring(0, 100));
        }
      }

      const icon = linked ? "✅" : "⚠️";
      const title = linked ? "Comment Auto-Reply is FIXED!" : "Token Stored (IG link needs manual check)";
      const cssClass = linked ? "success" : "card";

      return htmlPage("Result",
        '<div class="card ' + cssClass + '"><h1>' + icon + ' ' + title + '</h1>'
        + '<p>Page: <strong>' + (pageCategory || "unknown") + '</strong> (' + pageId + ')</p>'
        + '<p>IG linked: ' + (linked ? "Yes" : "No") + '</p>'
        + '<p>Webhook: ' + (subscribed ? "Subscribed" : "Not subscribed") + '</p>'
        + '<p>Used existing page: ' + (existingPageUsed ? "Yes" : "No") + '</p>'
        + '<hr><p style="font-size:12px;color:#888;">Log:</p><pre>' + log.join("\n") + '</pre>'
        + '<a href="' + baseUrl + '/api/fix-all" class="btn" style="margin-top:12px">Check Full Status</a></div>');
    }

    // --- STANDARD FLOW ---
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.redirect(baseUrl + "/login");
    }

    const state = verifyOAuthState(rawState);
    if (!state) {
      return NextResponse.redirect(baseUrl + "/settings?facebook=invalid_state");
    }

    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId: state.workspaceId, userId: session.user.id },
    });

    if (!membership || !canManageWorkspace(membership.role)) {
      return NextResponse.redirect(baseUrl + "/settings?facebook=forbidden");
    }

    const version = process.env.META_GRAPH_API_VERSION ?? "v26.0";
    const accountsUrl = "https://graph.facebook.com/" + version + "/me/accounts"
      + "?fields=id,name,access_token,instagram_business_account{id,username,name}"
      + "&access_token=" + encodeURIComponent(longLivedFbToken);
    const accountsResp = await fetch(accountsUrl);
    const accountsData: any = await accountsResp.json();

    if (!accountsData.data || accountsData.data.length === 0) {
      throw new Error("No Facebook pages found for this user");
    }

    const igAccount = await prisma.instagramAccount.findFirst({
      where: { workspaceId: state.workspaceId },
      orderBy: { connectedAt: "desc" },
    });

    if (!igAccount) {
      throw new Error("No Instagram account found. Connect Instagram first.");
    }

    let matchedPage = accountsData.data.find(
      (p: any) => p.instagram_business_account?.id === igAccount.instagramId
    );
    if (!matchedPage) {
      matchedPage = accountsData.data.find((p: any) => p.instagram_business_account);
    }

    if (!matchedPage || !matchedPage.instagram_business_account) {
      throw new Error(
        "Instagram Business account must be linked to a Facebook Page. "
        + "Go to Instagram Settings -> Account -> Linked Accounts -> Facebook to connect it."
      );
    }

    const pageToken = matchedPage.access_token;
    const encryptedPageToken = encryptToken(pageToken);
    const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    let webhookSubscribed = igAccount.webhookSubscribed;
    try {
      const subscription = await subscribeInstagramAccountToWebhooks(
        matchedPage.instagram_business_account.id, pageToken
      );
      webhookSubscribed = Boolean(subscription.success);
    } catch {
      console.warn("[FacebookCallback] Webhook subscription failed");
    }

    await prisma.instagramAccount.update({
      where: { id: igAccount.id },
      data: { pageToken: encryptedPageToken, tokenExpiresAt, webhookSubscribed },
    });

    return NextResponse.redirect(baseUrl + "/dashboard?facebook_connected=true");

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[FacebookCallback] Error:", err);

    if (rawState?.startsWith("simple_fix")) {
      return htmlPage("Error",
        '<div class="card error"><h1>Error</h1><p>' + message.replace(/</g, "&lt;").substring(0, 500)
        + '</p><a href="' + baseUrl + '/api/fb-fix" class="btn" style="margin-top:16px">Try Again</a></div>');
    }

    return NextResponse.redirect(
      baseUrl + "/api/fb-fix?error=" + encodeURIComponent(message.substring(0, 200))
    );
  }
}