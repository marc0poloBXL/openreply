import { getBaseUrl } from "@/lib/env";
import { redirect } from "next/navigation";

export default function InstagramTestPage() {
  const baseUrl = getBaseUrl();
  const redirectUri = `${baseUrl}/api/instagram-test-callback`;

  const clientId = process.env.INSTAGRAM_APP_ID ?? "NOT SET";
  const scope = encodeURIComponent(
    "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_manage_insights"
  );

  const authUrl = `https://www.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code&state=test123`;

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif", maxWidth: 800, margin: "0 auto" }}>
      <h1>Instagram OAuth Diagnostic</h1>

      <div style={{ background: "#f5f5f5", padding: 20, borderRadius: 8, marginTop: 20 }}>
        <h2>Step 1: Click to authorize</h2>
        <p><strong>Redirect URI:</strong> <code>{redirectUri}</code></p>
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
        <p>
          <strong>Debug Info:</strong> This page bypasses the state signing and workspace
          logic to isolate the OAuth redirect URI issue.
        </p>
        <p>After clicking the button and authorizing, you will see the raw response.</p>
      </div>
    </div>
  );
}