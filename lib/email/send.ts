/**
 * Email utility — sends transactional emails via Resend.
 * Gracefully skips if RESEND_API_KEY is not set so the app
 * works in development without email infrastructure.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "Stoic Zodiac <noreply@stoiczodiac.com>";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/** Low-level send — best-effort, never throws. Returns true on success. */
export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log("[Email] Skipped — no RESEND_API_KEY set. Would have sent to", to);
    return false;
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.log("[Email] Send failed:", resp.status, body.substring(0, 200));
      return false;
    }
    return true;
  } catch (e: any) {
    console.log("[Email] Send threw:", e.message);
    return false;
  }
}

/**
 * Send the "Your Stoic Sign" quiz result email.
 * Contains the full result, a quote, and a soft CTA to the weekly forecast.
 */
export async function sendQuizResultEmail(
  to: string,
  result: {
    zodiacSign: string;
    stoicMatch: string;
    stoicTitle: string;
    element: string;
    description: string;
    quote: string;
  }
): Promise<boolean> {
  const elementEmoji: Record<string, string> = {
    fire: "🔥", earth: "🌍", air: "💨", water: "🌊",
  };
  const emoji = elementEmoji[result.element] || "🏛️";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f0e8;margin:0;padding:0;color:#2c2a26}
  .container{max-width:560px;margin:0 auto;padding:24px 20px}
  .card{background:#fff;border-radius:16px;padding:32px 24px;box-shadow:0 2px 12px rgba(0,0,0,0.06)}
  .element{font-size:48px;text-align:center;margin-bottom:8px}
  h1{font-family:Georgia,serif;font-size:26px;font-weight:700;text-align:center;margin:0 0 4px}
  .match{font-size:18px;color:#b8860b;font-weight:600;text-align:center;margin-bottom:4px}
  .title{font-size:15px;color:#6b6156;text-align:center;margin-bottom:24px}
  .divider{height:1px;background:#e8e0d4;margin:20px 0}
  .desc{font-size:15px;line-height:1.6;color:#444;margin-bottom:16px}
  .quote{font-style:italic;font-size:16px;color:#4a6b5d;padding:16px 20px;background:#f0f5f0;border-radius:10px;margin:16px 0;line-height:1.5}
  .cta{display:block;background:#b8860b;color:#fff;text-align:center;padding:14px 24px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;margin:24px 0 0}
  .footer{text-align:center;font-size:12px;color:#8a8176;margin-top:24px}
  .footer a{color:#8a8176}
</style>
</head>
<body>
<div class="container">
<div class="card">
  <div class="element">${emoji}</div>
  <h1>Your Stoic Sign: ${result.zodiacSign}</h1>
  <div class="match">${result.stoicMatch} — ${result.stoicTitle}</div>
  <div class="title">Element: ${result.element.toUpperCase()}</div>
  <div class="divider"></div>
  <div class="desc">${result.description}</div>
  <div class="quote">${result.quote}</div>
  <div class="divider"></div>
  <p style="font-size:14px;color:#6b6156;line-height:1.5">
    Your element group (<strong>${result.element.toUpperCase()}</strong>) includes other signs too.
    Explore how each one lives Stoic wisdom in its own way.
  </p>
  <a class="cta" href="https://www.instagram.com/stoiczodiac/">Follow @stoiczodiac for daily Stoic wisdom</a>
  <div class="footer">
    <p>You received this because you took the "What's Your Stoic Sign?" quiz.</p>
    <p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>
  </div>
</div>
</div>
</body>
</html>`;

  return sendEmail({ to, subject: `Your Stoic Sign: ${result.zodiacSign} ✦ ${result.stoicMatch}`, html });
}