// check-comments.mjs — Check if there are any comments on IG posts
// Uses IGAA token (from env or first arg)
// Falls back to fix-all endpoint to get status

const token = process.argv[2];

async function call(method, url, body) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(body).toString();
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { raw: text.substring(0, 300) }; }
}

async function main() {
  if (!token) {
    // Hit the running fix-all endpoint to see current status
    console.log("=== Getting status from fix-all ===");
    const r = await call("GET", "https://openreply-zeta-ruby.vercel.app/api/fix-all");
    console.log("IG subscription:", JSON.stringify(r.igSubscriptionViaIGAA, null, 2));
    console.log("IG account type:", JSON.stringify(r.igAccountType, null, 2));
    console.log("FB App subscriptions:", JSON.stringify(r.fbAppSubscriptionsFinal || r.fbAppSubscriptions, null, 2));
    console.log("Errors:", JSON.stringify(r.errors, null, 2));
    return;
  }

  // Check recent media
  console.log("=== Recent media ===");
  const r1 = await call("GET", `https://graph.instagram.com/v21.0/17841438935909153/media?fields=id,caption,media_type,timestamp,comments_count&limit=5&access_token=${encodeURIComponent(token)}`);
  console.log(JSON.stringify(r1, null, 2));

  if (r1?.data) {
    for (const post of r1.data) {
      if (post.comments_count > 0 || true) {
        // Check comments on this post
        console.log(`\n=== Comments for ${post.id} ===");
        const r2 = await call("GET", `https://graph.instagram.com/v21.0/${post.id}/comments?fields=id,text,timestamp,username&access_token=${encodeURIComponent(token)}`);
        console.log(JSON.stringify(r2, null, 2));
        break; // Just check one post
      }
    }
  }
}
main().catch(e => console.error(e.message));