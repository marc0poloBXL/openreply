import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = request.nextUrl.searchParams.get("state");
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  // Show error page
  if (error) {
    return new Response(
      `<!DOCTYPE html>
<html><body style="font-family:sans-serif;padding:40px">
<h1>Instagram returned an error</h1>
<p>Error: ${error}</p>
<p>State: ${state}</p>
</body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code) {
    return new Response(
      `<!DOCTYPE html>
<html><body style="font-family:sans-serif;padding:40px">
<h1>No authorization code received</h1>
<p>Instagram did not return a code parameter.</p>
<p>Query params: ${JSON.stringify(Object.fromEntries(request.nextUrl.searchParams))}</p>
</body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const redirectUri = `${baseUrl}/api/instagram-test-callback`;

  // Build the token exchange request manually
  const clientId = process.env.INSTAGRAM_APP_ID ?? "NOT SET";
  const clientSecret = process.env.INSTAGRAM_APP_SECRET ?? "NOT SET";

  // Use URLSearchParams like the main code does
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const bodyStr = body.toString();
  const safeBody = bodyStr.replace(/client_secret=[^&]+/, "client_secret=***");

  let exchangeResult;
  let responseStatus = 0;
  let responseBody = "";

  try {
    const resp = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: bodyStr,
    });
    responseStatus = resp.status;
    responseBody = await resp.text();
    exchangeResult = responseStatus === 200 ? "SUCCESS" : "FAILED";
  } catch (err: any) {
    exchangeResult = "NETWORK_ERROR";
    responseBody = err.message;
  }

  let parsedBody;
  try {
    parsedBody = JSON.parse(responseBody);
  } catch {
    parsedBody = { raw: responseBody.slice(0, 500) };
  }

  return new Response(
    `<!DOCTYPE html>
<html><body style="font-family:sans-serif;padding:40px;max-width:800px">
<h1>Instagram OAuth Diagnostic Result</h1>

<div style="background:#e8f5e9;padding:15px;border-radius:8px">
<h3>✅ Authorization Step</h3>
<p><strong>Code received:</strong> ${code.slice(0, 20)}...</p>
<p><strong>State:</strong> ${state}</p>
<p><strong>Redirect URI used:</strong> <code>${redirectUri}</code></p>
</div>

<div style="background:${responseStatus === 200 ? "#e8f5e9" : "#ffebee"};padding:15px;border-radius:8px;margin-top:20px">
<h3>${responseStatus === 200 ? "✅" : "❌"} Token Exchange Step</h3>
<p><strong>Endpoint:</strong> <code>https://api.instagram.com/oauth/access_token</code></p>
<p><strong>HTTP Status:</strong> ${responseStatus}</p>
<p><strong>Request body (safe):</strong> <code style="word-break:break-all">${safeBody}</code></p>
</div>

<div style="background:#f5f5f5;padding:15px;border-radius:8px;margin-top:20px">
<h3>📦 Raw Response</h3>
<pre style="white-space:pre-wrap;word-break:break-all">${JSON.stringify(parsedBody, null, 2)}</pre>
</div>

${
  responseStatus === 200
    ? `<div style="background:#e8f5e9;padding:15px;border-radius:8px;margin-top:20px">
<h3>✅ SUCCESS! Token received!</h3>
<p>The Instagram connection should work now. Go back to the app and try the normal Connect Instagram button.</p>
</div>`
    : `<div style="background:#ffebee;padding:15px;border-radius:8px;margin-top:20px">
<h3>❌ Token exchange failed</h3>
<p>This means the redirect URI in the token exchange doesn't match what Instagram recorded during authorization.</p>
<p>Debug the exact encoded values:</p>
<ul>
<li>Authorize redirect_uri param: ${encodeURIComponent(redirectUri)}</li>
<li>Exchange redirect_uri param: ${encodeURIComponent(redirectUri)}</li>
</ul>
</div>`
}
<p style="margin-top:20px"><a href="${baseUrl}/instagram-test" style="color:#0095f6">← Try again</a></p>
</body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}