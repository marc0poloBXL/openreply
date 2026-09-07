/**
 * Token Helper — Server-Side Only
 *
 * Instead of OAuth redirect (which fails due to missing redirect URI),
 * this page lets you paste your existing token from Graph API Explorer.
 * The server then calls /me/accounts to find the Page token.
 * No CORS issues, no OAuth redirects.
 */

const APP_ID = process.env.FACEBOOK_APP_ID || "1051360407668084";
const API_VER = process.env.META_GRAPH_API_VERSION || "v26.0";
const IG_ID = "17841438935909153";
const PAGE_ID = "61594011424463";
const CALLBACK_URL = "https://openreply-zeta-ruby.vercel.app/api/webhook";
const VERIFY_TOKEN = "stoiczodiac-webhook-2026";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userToken = url.searchParams.get("token");

  if (!userToken) {
    return new Response(htmlPage("Get Facebook Page Token",
      `<h2>Get a Page Token for @stoiczodiac</h2>
       <p><strong>Step 1:</strong> Go to the Graph API Explorer and get your User Token:</p>
       <p><a href="https://developers.facebook.com/tools/explorer/${APP_ID}/" target="_blank" style="color:#1877F2;">https://developers.facebook.com/tools/explorer/${APP_ID}/</a></p>
       <ul>
         <li>Make sure the dropdown says "User Token" (not Page Token)</li>
         <li>Permissions should include: <code>pages_show_list</code>, <code>pages_read_engagement</code></li>
         <li>Click "Generate Access Token" and authorize</li>
       </ul>
       <p><strong>Step 2:</strong> Paste the token (EAA...) here:</p>
       <form method="get" action="">
         <input type="text" name="token" placeholder="Paste EAA... token here"
                style="width:100%;padding:10px;border:1px solid #ccc;border-radius:6px;font-family:monospace;font-size:13px;box-sizing:border-box;">
         <button type="submit" style="background:#1877F2;color:white;border:none;padding:10px 20px;border-radius:6px;font-size:14px;cursor:pointer;margin-top:10px;">
           🔍 Get Page Token
         </button>
       </form>`
    ), { headers: { "content-type": "text/html" } });
  }

  try {
    // Step 1: Try /me/accounts with the user's token directly
    const accountsResp = await fetch(
      `https://graph.facebook.com/${API_VER}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(userToken)}`
    );
    const accountsData = await accountsResp.json();

    if (accountsData.error) {
      return new Response(htmlPage("❌ API Error",
        `<p class="error">${accountsData.error.message}</p>
         <p>Type: ${accountsData.error.type} (Code: ${accountsData.error.code})</p>
         <p style="margin-top:12px;">
           <a href="?" style="color:#1877F2;">← Try again</a>
         </p>`
      ), { headers: { "content-type": "text/html" } });
    }

    if (!accountsData.data || accountsData.data.length === 0) {
      // /me/accounts returned empty — try via Business Manager
      return new Response(htmlPage("⚠️ No Pages via User Token",
        `<p class="error">The Facebook API returned no pages for your user token.</p>
         <p>This usually means the page is under a Business Manager.</p>
         <p>Let me try the Business Manager approach instead... <a href="?token=${encodeURIComponent(userToken)}&bm=true" style="color:#1877F2;">Click here to try via Business Manager</a></p>`
      ), { headers: { "content-type": "text/html" } });
    }

    // Find the Stoic Zodiac page
    const stoicPage = accountsData.data.find((p: any) =>
      p.instagram_business_account?.id === IG_ID ||
      p.id === PAGE_ID ||
      p.name?.toLowerCase().includes("stoic")
    );

    if (!stoicPage) {
      let list = accountsData.data.map((p: any) =>
        `"${p.name}"${p.instagram_business_account ? ` → IG: @${p.instagram_business_account.username}` : ""}`
      ).join("<br>");
      return new Response(htmlPage("⚠️ Stoic Zodiac Not Found",
        `<p>Could not find "Stoic Zodiac" in your pages. Available pages:</p>
         <p>${list}</p>
         <p style="margin-top:12px;">
           <a href="?" style="color:#1877F2;">← Try a different token</a>
         </p>`
      ), { headers: { "content-type": "text/html" } });
    }

    // Success! Show the page token
    const pageToken = stoicPage.access_token;
    return renderSuccess(pageToken, stoicPage.name, userToken);

  } catch (e: any) {
    return new Response(htmlPage("❌ Error",
      `<p class="error">${e.message}</p>
       <p><a href="?" style="color:#1877F2;">← Try again</a></p>`
    ), { headers: { "content-type": "text/html" } });
  }
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const userToken = formData.get("token")?.toString().trim() || "";
  const useBM = formData.get("bm") === "true";

  if (!userToken) {
    return new Response(htmlPage("❌ Missing Token",
      `<p class="error">No token provided. <a href="?" style="color:#1877F2;">← Try again</a></p>`
    ), { headers: { "content-type": "text/html" } });
  }

  try {
    if (useBM) {
      // Try Business Manager approach
      const BM_ID = "5180791675279566";
      const bmResp = await fetch(
        `https://graph.facebook.com/${API_VER}/${BM_ID}/owned_pages?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(userToken)}`
      );
      const bmData = await bmResp.json();

      if (bmData.error) {
        return new Response(htmlPage("❌ Business Manager Access Denied",
          `<p class="error">${bmData.error.message}</p>
           <p style="margin-top:12px;">Your token doesn't have <code>business_management</code> permission.</p>
           <p><strong>Option 1:</strong> In the Graph API Explorer, add <code>business_management</code> to your token permissions, then try again.</p>
           <p><strong>Option 2:</strong> Use the Settings page in OpenReply to paste the token directly.</p>
           <p><a href="?" style="color:#1877F2;">← Try again with a different token</a></p>`
        ), { headers: { "content-type": "text/html" } });
      }

      if (!bmData.data || bmData.data.length === 0) {
        return new Response(htmlPage("⚠️ No Pages in Business Manager",
          `<p class="error">No pages found in Business Manager ${BM_ID}.</p>
           <p><a href="?" style="color:#1877F2;">← Try again</a></p>`
        ), { headers: { "content-type": "text/html" } });
      }

      const stoicPage = bmData.data.find((p: any) =>
        p.instagram_business_account?.id === IG_ID ||
        p.id === PAGE_ID ||
        p.name?.toLowerCase().includes("stoic")
      );

      if (!stoicPage) {
        let list = bmData.data.map((p: any) =>
          `"${p.name}"${p.instagram_business_account ? ` → IG: @${p.instagram_business_account.username}` : ""}`
        ).join("<br>");
        return new Response(htmlPage("⚠️ Not Found in BM",
          `<p>Could not find "Stoic Zodiac" in Business Manager pages:</p>
           <p>${list}</p>
           <p><a href="?" style="color:#1877F2;">← Try again</a></p>`
        ), { headers: { "content-type": "text/html" } });
      }

      return renderSuccess(stoicPage.access_token, stoicPage.name, userToken);
    }

    // Regular /me/accounts approach
    const accountsResp = await fetch(
      `https://graph.facebook.com/${API_VER}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(userToken)}`
    );
    const accountsData = await accountsResp.json();

    // ... same logic as GET
    if (accountsData.error) {
      return new Response(htmlPage("❌ API Error",
        `<p class="error">${accountsData.error.message}</p>
         <p><a href="?" style="color:#1877F2;">← Try again</a></p>`
      ), { headers: { "content-type": "text/html" } });
    }

    if (!accountsData.data || accountsData.data.length === 0) {
      return new Response(htmlPage("⚠️ No Pages",
        `<p class="error">No pages found.</p>
         <form method="post" action="">
           <input type="hidden" name="token" value="${encodeURIComponent(userToken)}">
           <input type="hidden" name="bm" value="true">
           <button type="submit" style="background:#1877F2;color:white;border:none;padding:10px 20px;border-radius:6px;font-size:14px;cursor:pointer;">
             🔍 Try via Business Manager instead
           </button>
         </form>
         <p><a href="?" style="color:#1877F2;">← Try a different token</a></p>`
      ), { headers: { "content-type": "text/html" } });
    }

    const stoicPage = accountsData.data.find((p: any) =>
      p.instagram_business_account?.id === IG_ID ||
      p.id === PAGE_ID ||
      p.name?.toLowerCase().includes("stoic")
    );

    if (!stoicPage) {
      let list = accountsData.data.map((p: any) =>
        `"${p.name}"${p.instagram_business_account ? ` → IG: @${p.instagram_business_account.username}` : ""}`
      ).join("<br>");
      return new Response(htmlPage("⚠️ Not Found",
        `<p>Available pages:</p><p>${list}</p>
         <p><a href="?" style="color:#1877F2;">← Try again</a></p>`
      ), { headers: { "content-type": "text/html" } });
    }

    return renderSuccess(stoicPage.access_token, stoicPage.name, userToken);

  } catch (e: any) {
    return new Response(htmlPage("❌ Error",
      `<p class="error">${e.message}</p>
       <p><a href="?" style="color:#1877F2;">← Try again</a></p>`
    ), { headers: { "content-type": "text/html" } });
  }
}

async function renderSuccess(pageToken: string, pageName: string, userToken: string) {
  // Also subscribe webhooks while we have the Page token
  let subscribed = false;
  try {
    // Per-account subscription
    const igSub = await fetch(
      `https://graph.facebook.com/${API_VER}/${IG_ID}/subscribed_apps`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: pageToken,
          subscribed_fields: "comments,messages",
        }),
      }
    );
    const igResult = await igSub.json();
    subscribed = Boolean(igResult.success || igResult.id);
  } catch (e) {
    // Non-critical
  }

  return new Response(htmlPage("✅ Token Found!",
    `<div class="success">
       <p><strong>✅ Page found:</strong> ${pageName}</p>
       <p><strong>Webhook subscription:</strong> ${subscribed ? "✅ Subscribed!" : "⚠️ Not subscribed yet"}</p>
     </div>
     <p><strong>Copy this Page Token (EA...):</strong></p>
     <pre id="token" style="user-select:all;word-break:break-all;font-size:12px;">${pageToken}</pre>
     <button onclick="navigator.clipboard.writeText(document.getElementById('token').textContent).then(() => this.textContent='✅ Copied!')"
             style="background:#1877F2;color:white;border:none;padding:10px 20px;border-radius:6px;font-size:14px;cursor:pointer;">
       📋 Copy Token
     </button>
     <hr style="margin:20px 0;border:none;border-top:1px solid #ddd;">
     <p style="color:#666;font-size:14px;">
       Now paste this in the chat so I can store it and finish setting everything up.
     </p>`
  ), { headers: { "content-type": "text/html" } });
}

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; line-height: 1.5; }
    h1 { font-size: 1.3em; }
    .error { background: #fee; color: #c00; padding: 12px; border-radius: 6px; }
    .success { background: #e8f5e9; color: #0a8a0a; padding: 12px; border-radius: 6px; }
    pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
    code { font-size: 13px; }
    hr { border: none; border-top: 1px solid #eee; }
    input, button { font-size: 14px; }
  </style>
</head>
<body>
  <h1>🦁 ${title}</h1>
  ${body}
</body>
</html>`;
}