/**
 * Birthday Reading email template.
 * Styled like the quiz-result email but tailored for the free reading delivery.
 */

export function birthdayReadingHtml(reading: {
  leadName: string;
  readingTitle: string;
  readingText: string;       // markdown-formatted reading
  birthDate: string;         // formatted "January 1"
  zodiacSign: string;
  stoicMatch: string;
  readingId: string;
  email: string;             // for the unsubscribe link
  baseUrl: string;
}): string {
  // Minimal markdown-to-HTML: split paragraphs, bold **text**, italic *text*
  const paragraphs = reading.readingText
    .split(/\n\n+/)
    .map((block) => {
      let html = block
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/\n/g, "<br>");
      // Headings
      html = html.replace(/^#{1,6}\s+(.+)/gm, (_, h) => `<h3 style="font-family:Georgia,serif;font-size:18px;margin:24px 0 8px;color:#2c2a26">${h}</h3>`);
      // Bullet lists
      html = html.replace(/^- (.+)/gm, "• $1");
      return `<p style="font-size:15px;line-height:1.7;color:#444;margin:0 0 14px">${html}</p>`;
    })
    .join("");

  const upsellHtml = `
<div style="margin:28px 0 0;padding:20px 24px;background:#f9f5eb;border-radius:10px;border:1px solid #e8e0d4">
  <h3 style="font-family:Georgia,serif;font-size:17px;color:#2c2a26;margin:0 0 8px">🔮 Go Deeper</h3>
  <p style="font-size:14px;line-height:1.5;color:#6b6156;margin:0 0 12px">
    This free reading is based on your birth date only. With your <strong>exact birth time</strong> and <strong>birthplace</strong>,
    a full natal-chart interpretation reveals timing, life cycles, and your sign's complete archetype.
  </p>
  <p style="font-size:13px;line-height:1.5;color:#6b6156;margin:0 0 14px">
    ⬇ <a href="${reading.baseUrl}/api/birthday-reading/${reading.readingId}/pdf" style="color:#b8860b;font-weight:600;text-decoration:none">Download your free reading (PDF)</a> to keep it.
  </p>
  <a href="${reading.baseUrl}/birthday-reading/${reading.readingId}?upgrade=true"
     style="display:inline-block;background:#b8860b;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">
    Get Your Full Reading
  </a>
  <p style="font-size:12px;color:#8a8176;margin-top:8px">
    Prefer to skip the offer? <a href="${reading.baseUrl}/api/unsubscribe?email=${encodeURIComponent(reading.email)}" style="color:#8a8176">Unsubscribe</a>
  </p>
</div>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f0e8;margin:0;padding:0;color:#2c2a26}
  .container{max-width:560px;margin:0 auto;padding:24px 20px}
  .card{background:#fff;border-radius:16px;padding:32px 24px;box-shadow:0 2px 12px rgba(0,0,0,0.06)}
  .divider{height:1px;background:#e8e0d4;margin:20px 0}
  .footer{text-align:center;font-size:12px;color:#8a8176;margin-top:24px}
  .footer a{color:#8a8176}
</style>
</head>
<body>
<div class="container">
<div class="card">
  <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:700;text-align:center;margin:0 0 4px;color:#2c2a26">
    ${reading.readingTitle}
  </h1>
  <p style="font-size:16px;color:#b8860b;font-weight:600;text-align:center;margin:0 0 4px">
    ${reading.zodiacSign} ✦ ${reading.stoicMatch}
  </p>
  <p style="font-size:14px;color:#6b6156;text-align:center;margin:0 0 24px">
    Born ${reading.birthDate}
  </p>
  <div class="divider"></div>
  ${paragraphs}
  ${upsellHtml}
  <div class="divider"></div>
  <div class="footer">
    <p style="margin:0 0 4px">You received this because you requested your free Stoic Zodiac reading.</p>
    <p style="margin:0"><a href="${reading.baseUrl}/api/unsubscribe?email=${encodeURIComponent(reading.email)}">Unsubscribe</a></p>
  </div>
</div>
</div>
</body>
</html>`;
}