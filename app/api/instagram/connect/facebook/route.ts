import { NextResponse } from "next/server";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { getBaseUrl } from "@/lib/env";
import { createOAuthState, getFacebookAuthorizationUrl } from "@/lib/meta/oauth";

const FB_OAUTH_ENV = ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET", "NEXTAUTH_SECRET"] as const;

function getMissingFacebookOAuthEnv(): string[] {
  return FB_OAUTH_ENV.filter((name) => !process.env[name]);
}

/**
 * Starts the Facebook Login OAuth flow (second step).
 * This is called after Instagram is already connected, to also get a
 * Facebook Page token for reading comments.
 */
export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.redirect(`${getBaseUrl()}/login`);
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.redirect(`${getBaseUrl()}/settings?facebook=forbidden`);
  }

  const missingEnv = getMissingFacebookOAuthEnv();
  if (missingEnv.length > 0) {
    return NextResponse.redirect(
      `${getBaseUrl()}/settings?instagram=misconfigured&missing=${encodeURIComponent(
        missingEnv.join(",")
      )}`
    );
  }

  const redirectUri = `${getBaseUrl()}/api/instagram/callback/facebook`;
  const state = createOAuthState(context.workspaceId);

  return NextResponse.redirect(getFacebookAuthorizationUrl(redirectUri, state));
}