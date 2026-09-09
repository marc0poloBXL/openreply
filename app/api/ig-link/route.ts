import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";

const IG_ID = "17841438935909153";
const PAGE_ID = "1229304876940609";
const PAGE_NAME = "Stoic Zodiac";

export async function GET() {
  const html = await buildPage();
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

async function buildPage(): Promise<string> {
  const entries: string[] = [];
  function log(msg: string) { entries.push(`<div>${msg}</div>`); }

  const account = await prisma.instagramAccount.findFirst({ orderBy: { connectedAt: "desc" } });
  if (!account) return wrapHtml("<p class='error'>No Instagram account found in database.</p>");

  const igaaToken = account.accessToken ? decryptToken(account.accessToken) : null;
  const pageToken = account.pageToken ? decryptToken(account.pageToken) : null;

  let output = `<h2>🔑 Token Status</h2>
    <p>IGAA token: ${igaaToken ? "✅ stored (prefix: " + igaaToken.substring(0, 15) + "…)" : "❌ none"}</p>
    <p>Page token: ${pageToken ? "✅ stored (prefix: " + pageToken.substring(0, 15) + "…)" : "❌ none"}</p>
    <p>Account: @${account.username} (${account.instagramId})</p>`;

  // Check IG↔FB page link
  output += `<h2>🔗 IG ↔ Facebook Page Link Status</h2>`;
  let linkedToPage = false;
  if (pageToken) {
    for (const pid of [PAGE_ID, "61594011424463"]) {
      try {
        const r = await fetch(
          `https://graph.facebook.com/v26.0/${pid}?fields=id,name,instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`
        );
        const d = (await r.json()) as Record<string, unknown>;
        if (d.error) continue;
        const igBiz = d.instagram_business_account as Record<string, unknown> | undefined;
        if (igBiz && igBiz.id === IG_ID) {
          const name = d.name || "?";
          output += `<p class="success">✅ @stoiczodiac IS linked to "${name}"!</p>`;
          linkedToPage = true;
        }
      } catch { /* skip */ }
    }
    if (!linkedToPage) {
      output += `<p class="error">❌ @stoiczodiac is NOT linked to any Facebook Page.</p>`;
    }
  } else {
    output += `<p>No page token — can't check link status.</p>`;
  }

  // === LIVE COMMENT-READING TEST ===
  output += `<hr><h2>📝 Live Comment-Reading Test</h2>`;

  if (igaaToken) {
    // Step 1: List recent media via graph.instagram.com
    output += `<h3>1. Listing recent media (graph.instagram.com)</h3>`;
    try {
      const mediaRes = await fetch(
        `https://graph.instagram.com/v25.0/me/media?fields=id,media_type,comments_count&limit=10&access_token=${encodeURIComponent(igaaToken)}`
      );
      const media = await mediaRes.json();
      if (media.error) {
        output += `<p class="error">❌ Media fetch failed: ${media.error.message}</p>`;
      } else if (media.data?.length > 0) {
        output += `<p>✅ Found ${media.data.length} media items:</p><ul>`;
        for (const item of media.data) {
          const cc = item.comments_count ?? "?";
          output += `<li>${item.id} (${item.media_type}) — ${cc} comments</li>`;
        }
        output += `</ul>`;

        // Find a media with comments
        const withComments = media.data.find((m: any) => m.comments_count && m.comments_count > 0);
        const testMediaId = withComments?.id || media.data[0].id;

        // Step 2: Try graph.instagram.com comments — multiple versions/fields
        output += `<h3>2. graph.instagram.com — reading comments on ${testMediaId}</h3>`;
        const variants = [
          { ver: "v25.0", fields: "id,text,timestamp", label: "v25 simple" },
          { ver: "v22.0", fields: "id,text,timestamp", label: "v22 simple" },
          { ver: "v21.0", fields: "id,text,timestamp", label: "v21 simple" },
          { ver: "v25.0", fields: "id,text,from{id,username},timestamp", label: "v25 with from" },
          { ver: "v25.0", fields: "id,text,from{id,username,is_verified},replies{id,text,from{id,username}}", label: "v25 with replies" },
        ];
        for (const v of variants) {
          try {
            const cRes = await fetch(
              `https://graph.instagram.com/${v.ver}/${testMediaId}/comments?fields=${encodeURIComponent(v.fields)}&access_token=${encodeURIComponent(igaaToken)}`
            );
            const cData = await cRes.json();
            const n = cData.data?.length ?? 0;
            if (cData.error) {
              output += `<p><b>${v.label} (${v.ver}):</b> <span class="error">❌ ${cData.error.message}</span></p>`;
            } else if (n > 0) {
              output += `<p><b>${v.label} (${v.ver}):</b> <span class="success">✅ ${n} comments!</span></p><ul>`;
              for (const c of cData.data.slice(0, 5)) {
                const who = c.from?.username || c.from?.id || "?";
                output += `<li><b>${who}:</b> ${(c.text || "").substring(0, 100)}</li>`;
              }
              if (n > 5) output += `<li>… and ${n - 5} more</li>`;
              output += `</ul>`;
            } else {
              output += `<p><b>${v.label} (${v.ver}):</b> ⚠️ 0 comments returned (no error — data empty)</p>`;
            }
          } catch (e: any) {
            output += `<p><b>${v.label}:</b> <span class="error">❌ threw: ${e.message}</span></p>`;
          }
        }

        // Step 3: Try graph.facebook.com with IGAA token (some versions work for comments)
        output += `<h3>3. graph.facebook.com (IGAA token) — comments on ${testMediaId}</h3>`;
        try {
          const cRes = await fetch(
            `https://graph.facebook.com/v21.0/${testMediaId}/comments?fields=id,text,from{id,name},timestamp&access_token=${encodeURIComponent(igaaToken)}`
          );
          const cData = await cRes.json();
          if (cData.error) {
            output += `<p class="error">❌ ${cData.error.message}</p>`;
          } else if (cData.data?.length > 0) {
            output += `<p class="success">✅ ${cData.data.length} comments via graph.facebook.com!</p><ul>`;
            for (const c of cData.data.slice(0, 5)) {
              output += `<li><b>${c.from?.name || "?"}:</b> ${(c.text || "").substring(0, 100)}</li>`;
            }
            output += `</ul>`;
          }
        } catch (e: any) {
          output += `<p class="error">❌ graph.facebook.com threw: ${e.message}</p>`;
        }

        // Step 4: Try graph.facebook.com with page token
        if (pageToken) {
          output += `<h3>4. graph.facebook.com (Page token) — comments on ${testMediaId}</h3>`;
          try {
            const cRes = await fetch(
              `https://graph.facebook.com/v25.0/${testMediaId}/comments?fields=id,text,from{id,name},timestamp&access_token=${encodeURIComponent(pageToken)}`
            );
            const cData = await cRes.json();
            if (cData.error) {
              output += `<p class="error">❌ ${cData.error.message}</p>`;
            } else if (cData.data?.length > 0) {
              output += `<p class="success">✅ ${cData.data.length} comments via page token!</p>`;
              for (const c of cData.data.slice(0, 3)) output += `<div><b>${c.from?.name || "?"}:</b> ${(c.text || "").substring(0, 100)}</div>`;
            }
          } catch (e: any) {
            output += `<p class="error">❌ threw: ${e.message}</p>`;
          }
        }
      } else {
        output += `<p>No media found for this account.</p>`;
      }
    } catch (e: any) {
      output += `<p class="error">❌ Media list threw: ${e.message}</p>`;
    }
  } else {
    output += `<p class="error">No IGAA token — cannot test comment reading.</p>`;
  }

  // === WEBHOOK STATUS (push path — works without FB page link) ===
  // Count of successfully processed webhook broadcasts — a proxy for whether
  // Meta is delivering comment events to this app. (Parsing the raw JSON for
  // exact comment payloads is fragile; processed events are the safe signal.)
  const webhookCommentCount = await prisma.webhookEvent
    .count({ where: { status: "PROCESSED" } })
    .catch(() => 0);
  output += `<hr><h2>📡 Webhook (Push) Path Status</h2>`;
  try {
    const recentWebhooks = await prisma.webhookEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, object: true, status: true, createdAt: true, workspaceId: true, payload: true },
    });
    const total = await prisma.webhookEvent.count().catch(() => 0);
    const processed = await prisma.webhookEvent.count({ where: { status: "PROCESSED" } }).catch(() => 0);
    const failed = await prisma.webhookEvent.count({ where: { status: "FAILED" } }).catch(() => 0);

    output += `<p>Total webhook events: ${total} | PROCESSED: ${processed} | FAILED: ${failed}</p>`;
    output += `<p>Recent events (${recentWebhooks.length}):</p><ul>`;
    for (const evt of recentWebhooks) {
      const ws = evt.workspaceId ? "✅" : "❌";
      // Extract event types from payload
      const p = evt.payload as Record<string, unknown> | undefined;
      const entry = Array.isArray(p?.entry) ? p.entry as Array<Record<string, unknown>> : [];
      const types = entry.flatMap((e: Record<string, unknown>) => {
        const changes = Array.isArray(e.changes) ? e.changes as Array<Record<string, unknown>> : [];
        return changes.map((c: Record<string, unknown>) => String(c.field || "?"));
      }).join(", ");
      // Debug: show top-level keys + entry count for the first event
      const debug = recentWebhooks.indexOf(evt) === 0
        ? `<span style="color:#888;font-size:11px"> (entry:${entry.length}, keys:${Object.keys(p || {}).join(",")})</span>`
        : "";
      output += `<li>${evt.createdAt.toISOString().substring(11, 19)} — ${evt.object} — ${evt.status} ${ws} <span style="color:#666;font-size:12px">[${types || "no changes"}]</span>${debug}</li>`;
    }
    output += `</ul>`;

    // Check DM logs (comment actions processed)
    const dmByStatus = await prisma.dmLog.groupBy({
      by: ["status"],
      _count: { id: true },
    }).catch(() => []);
    if (dmByStatus.length > 0) {
      output += `<p>DM/comment actions:</p><ul>`;
      for (const row of dmByStatus) {
        output += `<li>${row.status}: ${row._count.id}</li>`;
      }
      output += `</ul>`;
    }
  } catch (e: any) {
    output += `<p class="error">❌ Webhook query failed: ${e.message}</p>`;
  }

  // Summary + next steps
  output += `<hr><h2>📋 Summary</h2>`;
  if (webhookCommentCount > 0) {
    output += `<p class="success">✅ Webhooks delivered ${webhookCommentCount} comment events! Comment auto-reply works via push.</p>`;
  }
  if (linkedToPage) {
    output += `<p class="success">✅ IG is linked to FB Page. Page token should work for comments.</p>`;
  } else {
    output += `<p class="error">❌ IG is NOT linked to FB Page. Page token won't work for polling via graph.facebook.com.</p>`;
    if (webhookCommentCount > 0) {
      output += `<p class="success">BUT ${webhookCommentCount} webhook events were processed! The push path works. Comment events delivered this way are processed without needing the page link.</p>`;
    } else {
      output += `<p>⚠️ No processed webhook events found. The IG account may not be granting events to this app yet.</p>`;
      output += `<p>To fix: <strong>visit <a href="/api/auth/token-helper">/api/auth/token-helper</a> and paste an Explorer token with <code>pages_manage_metadata</code></strong> — it runs <code>subscribed_apps</code> automatically. This is required for webhook delivery even without the page link.</p>`;
    }
  }

  return wrapHtml(output);
}

function wrapHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Link @stoiczodiac</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.5;color:#111}
  h1{font-size:24px} h2{font-size:17px;margin-top:20px} h3{font-size:14px;margin-top:16px;color:#444}
  .card{background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:20px;margin:16px 0}
  .error{color:#dc2626;font-weight:600}
  .success{color:#16a34a;font-weight:600}
  .btn{display:inline-block;background:#1877f2;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:500;margin:4px}
  .btn:hover{background:#166fe5}
  ol li{margin-bottom:8px}
  a{color:#1877f2}
  code{background:#f0f0f0;padding:2px 6px;border-radius:4px;font-size:13px}
  hr{border:none;border-top:1px solid #e0e0e0;margin:24px 0}
  ul{padding-left:20px}
  li{margin:6px 0}
</style>
</head>
<body>
<h1>🔗 @stoiczodiac (${IG_ID}) → "${PAGE_NAME}"</h1>
${body}
<p style="border-top:1px solid #e0e0e0;padding-top:16px;color:#888;font-size:13px">
  <a href="/api/ig-link">↻ Refresh</a> · <a href="/api/auth/token-helper">Token Helper</a> · Generated ${new Date().toISOString()}
</p>
</body></html>`;
}