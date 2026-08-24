import { getBaseUrl } from "@/lib/env";

export default function InstagramTestPage() {
  const baseUrl = getBaseUrl();
  const redirectUri = `${baseUrl}/api/instagram/callback`;

  const clientId = process.env.INSTAGRAM_APP_ID ?? "NOT SET";

  // Build the authorize URL manually to show every param
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_manage_insights",
    response_type: "code",
    state: "test123",
  });
  const authUrl = `https://www.instagram.com/oauth/authorize?${params.toString()}`;

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 800, margin: "0 auto" }}>
      <h1>Instagram OAuth Diagnostic</h1>

      <div style={{ background: "#f5f5f5", padding: 20, borderRadius: 8, marginTop: 20 }}>
        <h2>Step 1: Click to authorize</h2>
        <p><strong>Authorize URL:</strong></p>
        <code style={{ wordBreak: "break-all", fontSize: 12 }}>{authUrl}</code>
        <p style={{ marginTop: 10 }}><strong>Redirect URI:</strong> <code>{redirectUri}</code></p>
        <p><strong>Client ID:</strong> <code>{clientId}</code></p>
        <a
          href={authUrl}
          style={{
            display: "inline-block",
            background: "#0095f6",
            color: "white",
            padding: "12px 24px",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 16,
            marginTop: 10,
          }}
        >
          Connect Instagram (Diagnostic)
        </a>
      </div>

      <div style={{ background: "#fff3cd", padding: 20, borderRadius: 8, marginTop: 20 }}>
        <h3>⚠️ After authorizing</h3>
        <p>Instagram will redirect you to the main callback URL. When it fails,</p>
        <p><strong>Copy the FULL URL</strong> from your browser's address bar and paste it to me.</p>
        <p>The URL will look like:</p>
        <code style={{ fontSize: 12, wordBreak: "break-all" }}>
          {redirectUri}?code=AQBx-hBsH3...&state=test123#
        </code>
      </div>
    </div>
  );
}