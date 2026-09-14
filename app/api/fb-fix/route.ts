/**
 * One-Click Fix Route
 *
 * Shows a single button: "Fix Comment Auto-Reply"
 * User clicks → Facebook Login → creates new page → links IG → done!
 */

const APP_ID = process.env.FACEBOOK_APP_ID || "1051360407668084";
const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://openreply-zeta-ruby.vercel.app";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  const result = url.searchParams.get("result");
  const page = url.searchParams.get("page");
  const link = url.searchParams.get("link");
  const subscribed = url.searchParams.get("subscribed");
  const reason = url.searchParams.get("reason");

  // If returning from successful OAuth
  if (result === "done") {
    return htmlResponse(`
      <div class="card success">
        <div style="font-size:60px;margin-bottom:16px;">✅</div>
        <h2>Comment Auto-Reply is FIXED!</h2>
        <p>New page created with category: <strong>${page || "Brand"}</strong></p>
        <p>IG link: ${link === "true" ? "✅ Success" : "⚠️ Needs check"}</p>
        <p>Webhook subscribed: ${subscribed === "true" ? "✅ Yes" : "⚠️ Not yet"}</p>
        <hr style="margin:20px 0;">
        <p><strong>What happens next:</strong></p>
        <p>When someone comments on your Instagram posts, our webhook will receive the event and auto-reply.</p>
        <p>Leave a test comment from another account to verify it works!</p>
      </div>
      <p style="text-align:center;margin-top:20px;">
        <a href="/api/fix-all" style="color:#1877F2;">Check full status →</a>
      </p>
    `, "🎉 Fixed!");
  }

  if (result === "linked_no_api") {
    const errs = url.searchParams.get("errors") || "";
    return htmlResponse(`
      <div class="card ${link === "true" ? "success" : "error"}">
        <div style="font-size:60px;margin-bottom:16px;">${link === "true" ? "✅" : "⚠️"}</div>
        <h2>Partial Fix — Token Stored</h2>
        <p>Page token stored with category: <strong>${page || "unknown"}</strong></p>
        <p>IG link: ${link === "true" ? "✅ Linked" : "❌ Failed"}</p>
        <p>Webhook subscribed: ${subscribed === "true" ? "✅ Yes" : "⚠️ Not yet"}</p>
        ${errs ? `<hr style="margin:20px 0;"><p style="font-size:13px;color:#c00;"><strong>Details:</strong><br>${errs.replace(/;;/g, "<br>")}</p>` : ""}
        <hr style="margin:20px 0;">
        <p><a href="/api/fix-all" style="color:#1877F2;">Check full status →</a></p>
      </div>
    `, "⚠️ Partial Fix");
  }

  if (result === "linked") {
    return htmlResponse(`
      <div class="card success">
        <div style="font-size:60px;margin-bottom:16px;">✅</div>
        <h2>IG Linked to Existing Page!</h2>
        <p>Link result: ${link === "ok" ? "✅ Success" : "⚠️ " + link}</p>
        <hr style="margin:20px 0;">
        <p>Check <a href="/api/fix-all" style="color:#1877F2;">/api/fix-all</a> for full status.</p>
      </div>
    `, "✅ Linked!");
  }

  if (error === "denied") {
    return htmlResponse(`
      <div class="card error">
        <h2>Authorization Denied</h2>
        <p>You denied the Facebook login. To fix comment auto-reply, you need to authorize.</p>
        <p><a href="?start=1" class="btn">Try Again</a></p>
      </div>
    `, "⚠️ Denied");
  }

  if (error) {
    const details = url.searchParams.get("details") || "";
    return htmlResponse(`
      <div class="card error">
        <h2>Error</h2>
        <p>${error.replace(/</g, "&lt;")}</p>
        ${details ? `<hr style="margin:16px 0;"><p style="font-size:13px;color:#666;word-break:break-all;">${details.replace(/</g, "&lt;").replace(/;;/g, "<br>")}</p>` : ""}
        <p><a href="?start=1" class="btn">Try Again</a></p>
      </div>
    `, "❌ Error");
  }

  // Show the fix page
  const oauthUrl = `https://www.facebook.com/v26.0/dialog/oauth` +
    `?client_id=${APP_ID}` +
    `&redirect_uri=${encodeURIComponent(BASE + "/api/instagram/callback/facebook")}` +
    `&scope=${encodeURIComponent("pages_show_list,pages_read_engagement,pages_manage_metadata,business_management")}` +
    `&response_type=code` +
    `&state=simple_fix_create_page`;

  return htmlResponse(`
    <div class="card" style="text-align:center;">
      <h1 style="font-size:28px;margin-bottom:8px;">🦁 Stoic Zodiac</h1>
      <p style="color:#666;font-size:16px;margin-bottom:24px;">
        Comment auto-reply needs one fix: creating a Facebook Page with the right category.
      </p>
      <div style="background:#e8f5e9;border:2px solid #16a34a;border-radius:12px;padding:20px;margin:16px 0;text-align:left;">
        <p style="font-size:15px;margin:4px 0;"><strong>What this button does:</strong></p>
        <p style="font-size:14px;margin:4px 0;">1️⃣ Opens Facebook Login → click Continue/Authorize</p>
        <p style="font-size:14px;margin:4px 0;">2️⃣ Creates a new Facebook Page with business category</p>
        <p style="font-size:14px;margin:4px 0;">3️⃣ Links @stoiczodiac to the new page</p>
        <p style="font-size:14px;margin:4px 0;">4️⃣ Subscribes webhooks for comment events</p>
      </div>
      <p style="color:#c00;font-size:14px;">
        ⚠️ A new Facebook Page "Stoic Zodiac" will be created (Brand category).
      </p>
      <a href="${oauthUrl}" class="btn" style="display:inline-block;background:#1877F2;color:white;padding:18px 48px;border-radius:10px;text-decoration:none;font-size:20px;font-weight:600;margin:20px 0;">
        🔥 Fix Comment Auto-Reply NOW
      </a>
      <p style="color:#888;font-size:13px;">
        Facebook will ask you to authorize. Click <strong>Continue</strong> (not "Continue as...")
        then check all permission boxes.
      </p>
      <hr style="margin:24px 0;">
      <p style="font-size:13px;color:#666;">
        <strong>Already working?</strong> DM auto-reply is fully functional.<br>
        This only adds comment auto-reply capability.
      </p>
    </div>
  `, "🔧 Fix Comment Auto-Reply");
}

function htmlResponse(body: string, title: string): Response {
  return new Response(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family:-apple-system,sans-serif; max-width:520px; margin:40px auto; padding:20px; line-height:1.5; background:#f5f5f5; }
    .card { background:white; border-radius:12px; padding:24px; box-shadow:0 2px 8px rgba(0,0,0,0.08); }
    .success { border:2px solid #16a34a; }
    .error { border:2px solid #dc2626; }
    h1 { color:#333; }
    h2 { color:#333; font-size:20px; }
    .btn { background:#1877F2;color:white;border:none;padding:12px 28px;border-radius:8px;font-size:16px;cursor:pointer;text-decoration:none; }
    hr { border:none;border-top:1px solid #eee; }
    p { color:#444; }
  </style>
</head>
<body>
  ${body}
</body>
</html>`, { headers: { "content-type": "text/html" } });
}