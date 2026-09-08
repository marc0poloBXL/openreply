import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = request.nextUrl.searchParams.get("state");

  if (error) {
    return NextResponse.json({
      error: "User denied or error occurred",
      reason: request.nextUrl.searchParams.get("error_description") || error,
    });
  }

  if (!code) {
    return NextResponse.json({ error: "No authorization code received" }, { status: 400 });
  }

  // Forward the code to the parent route's POST handler
  // We do this by making an internal fetch to the parent route
  const origin = request.nextUrl.origin;
  const result = await fetch(`${origin}/api/ig-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, state }),
  });

  const data = await result.json();

  // Return a simple HTML page showing the result
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IG Link Result</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 20px; }
    pre { background: #f5f5f5; padding: 16px; border-radius: 8px; overflow-x: auto; }
    .success { color: #16a34a; font-size: 24px; font-weight: bold; }
    .fail { color: #dc2626; font-size: 18px; }
  </style>
</head>
<body>
  <h1>${data.linked ? '✅ IG Linked Successfully!' : '❌ Linking Result'}</h1>
  <pre>${JSON.stringify(data, null, 2)}</pre>
  ${!data.linked ? `
  <h2>Manual Steps</h2>
  <p>Try this in your browser instead:</p>
  <ol>
    <li>Go to <a href="https://www.facebook.com/settings?tab=account_center">Account Center</a></li>
    <li>Click "Accounts" → "Add accounts" → "Add Instagram account"</li>
    <li>Log into @stoiczodiac</li>
    <li>Go to Account Center → "Profiles" → "Coupled profiles"</li>
    <li>Add the Stoic Zodiac page and @stoiczodiac together</li>
  </ol>
  ` : ''}
  <p><a href="/api/ig-link">← Check again</a></p>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}