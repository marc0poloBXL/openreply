@AGENTS.md

## Problem Solving Guidelines
- Never modify code without first isolating the exact cause of the failure.
- If a solution fails, revert the changes entirely before trying a different approach.
- Always ask for user confirmation before performing major refactors.

## Instagram DM Automation Setup (completed 2026-09-05)

### Accounts & Apps
- **Meta App**: `stoiczodiac-dm` (ID: `1051360407668084`) — LIVE/PUBLISHED
- **Dev App (old)**: `stoicZodiac` (ID: `2817110661980046`) — In Development, no longer used
- **Live App (old)**: `stoiczodiac` (ID: `4628128514174903`) — has Instagram Business Login for webhooks
- **Instagram App**: ID `2616058292165458` (separate app for IGAA token exchange)
- **Business Manager**: ID `5180791675279566`
- **System User "bot"**: ID `61594008092430`
- **Facebook User (Marc Jelen)**: ID `4585334288457714` / `4599239443733865`

### Facebook Pages
- **Miami4Home**: ID `1112026815491700` — linked to miami4home Instagram
- **miamirealinfo**: ID unknown — linked to miamirealinfo Instagram
- **Stoic Zodiac**: ID `61594011424463` — linked to @stoiczodiac Instagram (created 2026-09-05)

### Instagram Account
- **@stoiczodiac**: IG ID `17841438935909153`
- Connected to OpenReply with IGAA token (via Instagram Business Login) — **expired Sep 5, needs fresh**
- IGAA token is the PRIMARY token for: DMs, conversations, media listing, user info, follower history
- Page token (stored) is a SEPARATE token for graph.facebook.com — requires IG↔FB page link to work
- **IG↔FB link status**: ❌ NOT CONFIRMED — /me/accounts shows no linked IG account

### Token Storage
- `InstagramAccount.accessToken`: IGAA token (encrypted) — works with `graph.instagram.com`
- `InstagramAccount.pageToken`: EA/Page token (encrypted) — works with `graph.facebook.com`
- Vercel env `FACEBOOK_APP_ID`=`1051360407668084`, `FACEBOOK_APP_SECRET`=stored as Secret

### Code Fixes Applied
1. `lib/meta/client.ts:473` — changed `facebookGraphBase()` to `baseUrlForToken(accessToken)` so IGAA tokens route to `graph.instagram.com` and EA tokens to `graph.facebook.com`
2. `app/api/instagram/resubscribe/route.ts` — uses Page token (when available) instead of IGAA token for webhook subscription
3. **2026-09-07: Reverted pageToken preference** — all messaging/media routes now use IGAA (accessToken) again. The pageToken can't access IG resources because the IG account is not linked to a FB page. Added `/api/auth/igaa-token` for IGAA token refresh.

### Remaining Issue
- ~~Webhook subscription still shows "pending"~~ ✅ **RESOLVED 2026-09-06**
- ~~Need to subscribe `17841438935909153/subscribed_apps` with the Page token~~ ✅ App-level webhook subscription active
- ~~Need a fresh Page Access Token~~ ✅ Generated via Business Manager "marc jelen" (id: 2052016095704629) owned_pages
- ~~Store token in DB~~ ✅ Encrypted in `InstagramAccount.pageToken`, expires 2026-11-01
- **IMPORTANT: IGAA token is expired** — the token that powers DMs, inbox, and media listing was last valid 2026-09-05. It cannot be refreshed after expiry. A fresh IGAA token must be pasted at `/api/auth/igaa-token` (see below).
- **@stoiczodiac is NOT linked to a Facebook Page** — our `/me/accounts` check found no `instagram_business_account` link. This means the page token (stored in DB) cannot access IG resources. To fix: in Instagram app → Account Center → Linked accounts → Facebook, connect to the "Stoic Zodiac" page. Blocking comment reading via graph.facebook.com but NOT blocking DM/conversation flows (those use IGAA on graph.instagram.com).
- App-level webhook (1051360407668084/subscriptions) active for instagram → comments, messages → callback URL: https://openreply-zeta-ruby.vercel.app/api/webhook
- Verify token: `stoiczodiac-webhook-2026`

### Token Refresh Process (✅ Works)

**IGAA token (powers DMs, inbox, media)** — when it expires (~60 days):
1. Go to https://openreply-zeta-ruby.vercel.app/api/auth/igaa-token
2. Click **"🔗 Connect Instagram"** — OAuth flow handles everything automatically
3. Token is exchanged to long-lived and stored — no token hunting needed

**Page token (for graph.facebook.com — comment reading)** — when it expires:
Run `fb_token_helper.mjs` locally — it starts a local server, prints a Facebook Login URL, handles OAuth, stores the new token.

### Business Managers
- "Marc" (5180791675279566) — has Miami4Home page
- "miamirealinfo" (9824014651061253) — has Miamirealinfo page  
- "marc jelen" (2052016095704629) — has **Stoic Zodiac** page (this is where the page token comes from)
