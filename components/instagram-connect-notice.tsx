"use client";

import { useSearchParams } from "next/navigation";

type Tone = "error" | "warning" | "success";

const TONE_CLASSES: Record<Tone, string> = {
  error: "border-error/20 bg-error/10 text-error",
  warning: "border-warning/20 bg-warning/10 text-warning",
  success: "border-success/20 bg-success/10 text-success",
};

const MESSAGES: Record<string, { tone: Tone; title: string; detail: string }> = {
  denied: {
    tone: "warning",
    title: "Instagram connection cancelled",
    detail:
      "You declined the permission prompt on Instagram. Start again and accept all requested permissions.",
  },
  invalid: {
    tone: "error",
    title: "Instagram connection expired",
    detail:
      "The login link was missing or older than 10 minutes. Click Connect Instagram to start a fresh attempt.",
  },
  forbidden: {
    tone: "error",
    title: "Not permitted",
    detail:
      "Only workspace owners and admins can connect an Instagram account.",
  },
  already_connected: {
    tone: "warning",
    title: "Account already connected",
    detail:
      "That Instagram account is connected to another workspace. Disconnect it there first, or connect a different account.",
  },
};

export function InstagramConnectNotice() {
  const searchParams = useSearchParams();
  const instagramStatus = searchParams.get("instagram");
  const facebookStatus = searchParams.get("facebook");
  const fbConnected = searchParams.get("facebook_connected");

  // Facebook connected successfully
  if (fbConnected === "true") {
    return (
      <Notice tone="success" title="Facebook Page connected!">
        <p>
          Your Facebook Page is now linked. The system can now read comments on
          your Instagram posts via the Facebook Graph API.
        </p>
      </Notice>
    );
  }

  if (!instagramStatus && !facebookStatus) return null;
  const status = facebookStatus || instagramStatus;
  const isFacebook = !!facebookStatus;

  if (isFacebook && status === "failed") {
    const reason = searchParams.get("reason");
    return (
      <Notice tone="error" title="Facebook Page connection failed">
        <p>
          Facebook accepted the login but the page could not be linked. Make sure
          your Facebook Page has an Instagram Business account connected.
        </p>
        {reason && (
          <p className="mt-2 font-mono text-xs break-words opacity-80">
            {reason}
          </p>
        )}
      </Notice>
    );
  }

  if (isFacebook && status === "denied") {
    return (
      <Notice tone="warning" title="Facebook Login cancelled">
        <p>
          You declined the permission prompt. The Facebook Page is needed to read
          comments on your Instagram posts.
        </p>
      </Notice>
    );
  }

  if (isFacebook && status === "invalid") {
    return (
      <Notice tone="error" title="Facebook Login expired">
        <p>
          The login link was missing or older than 10 minutes. Start a fresh
          Facebook Page connection attempt.
        </p>
      </Notice>
    );
  }

  if (isFacebook && status === "forbidden") {
    return (
      <Notice tone="error" title="Not permitted">
        <p>Only workspace owners and admins can connect a Facebook Page.</p>
      </Notice>
    );
  }

  if (status === "misconfigured") {
    const missing = (searchParams.get("missing") ?? "")
      .split(",")
      .filter(Boolean);

    return (
      <Notice tone="error" title="Instagram app not configured">
        <p>
          Set{" "}
          {missing.length > 0
            ? "these environment variables"
            : "the required environment variables"}{" "}
          and restart the server:
        </p>
        {missing.length > 0 && (
          <ul className="mt-2 space-y-1">
            {missing.map((name) => (
              <li key={name} className="font-mono text-xs">
                {name}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2">
          See <span className="font-mono text-xs">docs/setup.md</span> for how to
          obtain each value. Note that{" "}
          <span className="font-mono text-xs">ENCRYPTION_KEY</span> must be a
          64-character hex string.
        </p>
      </Notice>
    );
  }

  if (status === "failed") {
    const reason = searchParams.get("reason");

    return (
      <Notice tone="error" title="Instagram connection failed">
        <p>
          Instagram accepted the login but the connection could not be
          completed. This is usually a mismatched redirect URI or an app that is
          missing the required permissions.
        </p>
        {reason && (
          <p className="mt-2 font-mono text-xs break-words opacity-80">
            {reason}
          </p>
        )}
      </Notice>
    );
  }

  // Only instagram statuses reach here — facebook statuses return above
  if (!instagramStatus) return null;
  const known = MESSAGES[instagramStatus];
  if (!known) return null;

  return (
    <Notice tone={known.tone} title={known.title}>
      <p>{known.detail}</p>
    </Notice>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: Tone;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded border p-4 text-sm ${TONE_CLASSES[tone]}`}>
      <p className="font-semibold">{title}</p>
      <div className="mt-1 opacity-90">{children}</div>
    </div>
  );
}
