import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { getEncryptionKeyHex, requireEnv } from "@/lib/env";

const INSTAGRAM_OAUTH_URL = "https://www.instagram.com/oauth/authorize";
const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const FACEBOOK_OAUTH_URL = "https://www.facebook.com/dialog/oauth";
const FACEBOOK_TOKEN_URL = "https://graph.facebook.com/oauth/access_token";
const GRAPH_API_BASE = "https://graph.facebook.com";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

interface OAuthStatePayload {
  workspaceId: string;
  ts: number;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signState(payload: string): string {
  return createHmac("sha256", requireEnv("NEXTAUTH_SECRET"))
    .update(payload)
    .digest("base64url");
}

export function createOAuthState(workspaceId: string): string {
  const payload = base64UrlEncode(
    JSON.stringify({ workspaceId, ts: Date.now() } satisfies OAuthStatePayload)
  );
  return `${payload}.${signState(payload)}`;
}

export function verifyOAuthState(state: string | null): OAuthStatePayload | null {
  if (!state) return null;

  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;

  const expected = signState(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as OAuthStatePayload;
    if (!parsed.workspaceId || Date.now() - parsed.ts > STATE_MAX_AGE_MS) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Get the Facebook Login authorization URL.
 * This gives us a FB user token that works with graph.facebook.com
 * and allows reading comments on Instagram Business posts.
 */
export function getAuthorizationUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("FACEBOOK_APP_ID"),
    redirect_uri: redirectUri,
    scope:
      "pages_show_list pages_read_engagement pages_manage_metadata pages_messaging",
    response_type: "code",
    state,
  });

  return `${FACEBOOK_OAUTH_URL}?${params.toString()}`;
}

/**
 * Exchange a Facebook Login authorization code for an access token.
 * Returns a short-lived FB user token.
 */
export async function exchangeFbCodeForToken(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string }> {
  const url = new URL(FACEBOOK_TOKEN_URL);
  url.searchParams.set("client_id", requireEnv("FACEBOOK_APP_ID"));
  url.searchParams.set("client_secret", requireEnv("FACEBOOK_APP_SECRET"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  const response = await fetch(url.toString());
  if (!response.ok) {
    const body = await response.text().catch(() => "Unknown error");
    throw new Error(`Facebook token exchange failed: ${body.slice(0, 500)}`);
  }

  const data = await response.json();
  return { accessToken: data.access_token };
}

/**
 * Exchange a short-lived Facebook user token for a long-lived one.
 */
export async function exchangeFbLongLivedToken(
  shortLivedToken: string
): Promise<{ accessToken: string }> {
  const url = new URL(FACEBOOK_TOKEN_URL);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", requireEnv("FACEBOOK_APP_ID"));
  url.searchParams.set("client_secret", requireEnv("FACEBOOK_APP_SECRET"));
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const response = await fetch(url.toString());
  if (!response.ok) {
    const body = await response.text().catch(() => "Unknown error");
    throw new Error(`Facebook long-lived token exchange failed: ${body.slice(0, 500)}`);
  }

  const data = await response.json();
  return { accessToken: data.access_token };
}

/**
 * Get the Facebook Pages the user manages and find the one linked to
 * their Instagram Business account. Returns the page access token.
 */
export async function getConnectedPageToken(
  fbUserToken: string,
  igUserId: string
): Promise<{ pageId: string; pageToken: string; pageName: string } | null> {
  const version = process.env.META_GRAPH_API_VERSION ?? "v25.0";

  // Get the user's pages
  const pagesUrl = new URL(`${GRAPH_API_BASE}/${version}/me/accounts`);
  pagesUrl.searchParams.set("access_token", fbUserToken);

  const pagesResp = await fetch(pagesUrl.toString());
  const pagesData = await pagesResp.json() as { data?: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string } }> };

  if (!pagesData.data) return null;

  // Find the page connected to our Instagram account
  for (const page of pagesData.data) {
    if (page.instagram_business_account?.id === igUserId) {
      return {
        pageId: page.id,
        pageToken: page.access_token,
        pageName: page.name,
      };
    }
  }

  return null;
}

/**
 * Instagram Business Login: exchange code for token (kept for backward compat).
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; userId: string }> {
  // Instagram Business Login: token exchange uses Instagram credentials
  const body = new URLSearchParams({
    client_id: requireEnv("INSTAGRAM_APP_ID"),
    client_secret: requireEnv("INSTAGRAM_APP_SECRET"),
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const response = await fetch(INSTAGRAM_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  // Debug: log the exact body we sent (without secret)
  const debugBody = body.toString().replace(/client_secret=[^&]+/, "client_secret=***");
  console.log("[Instagram Token Exchange] Request:", {
    url: INSTAGRAM_TOKEN_URL,
    body: debugBody,
  });

  if (!response.ok) {
    const bodyText = await response.text();
    let error;
    try {
      error = JSON.parse(bodyText);
    } catch {
      error = { raw: bodyText };
    }
    // Graph API errors nest the detail under error.message whereas
    // the Basic Display endpoint puts it in error_message.
    const detail =
      error.error?.message ??
      error.error_description ??
      error.error_message ??
      error.error ??
      bodyText.slice(0, 500);
    console.error("[Instagram Token Exchange] Failed:", {
      status: response.status,
      detail,
      redirectUri,
      body: bodyText.slice(0, 1000),
    });
    throw new Error(
      `Token exchange failed: ${detail} | redirect_uri="${redirectUri}" | status=${response.status} | body=${bodyText.slice(0, 300)}`
    );
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    userId: String(data.user_id),
  };
}

function getEncryptionKey(): Buffer {
  return Buffer.from(getEncryptionKeyHex(), "hex");
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);

  return combined.toString("base64");
}

export function decryptToken(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedBase64, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8"
  );
}
