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

### Current Status (2026-09-10)
- ✅ **IG linked to FB Page** — confirmed via Facebook Page Settings UI (user confirmed "Connected Instagram: Stoic Zodiac @stoiczodiac")
- ✅ **Page token stored** — refreshed via token-helper 2026-09-10, valid until Nov 4. Has `pages_manage_metadata` scope.
- ✅ **IGAA token valid** — powers DMs, inbox, media listing. Valid ~60 days from last OAuth refresh.
- ✅ **IG account subscribed to webhooks** — `POST /{ig-id}/subscribed_apps` via IGAA token returned `success: true` on 2026-09-10
- ✅ **App-level webhook active** — app 1051360407668084 subscribed for `instagram` → `comments, messages` at callback URL `https://openreply-zeta-ruby.vercel.app/api/webhook`, verify token `stoiczodiac-webhook-2026`
- ❌ **graph.instagram.com returns 0 comments** — all 5 API variants tested (v21-v25, with/without `from` fields) return empty data silently. This is a confirmed API limitation for Business accounts.
- ❌ **graph.facebook.com with page token returns error 33** — "does not exist, cannot be loaded." The IG is linked in the UI but NOT at the API level (no `instagram_business_account` field on the page). The page token cannot access IG resources.
- ❌ **graph.facebook.com with IGAA token** — "Cannot parse access token" (IGAA tokens don't work on FB graph)
- ✅ **Webhook push path IS the primary path for comment delivery** — app-level subscription delivers events; individual IG subscription should now deliver comment events.
- ⚠️ **Polling fallback (comment-reconciler.ts) won't work** — uses page token for graph.facebook.com which returns error 33. Falls back to IGAA for graph.instagram.com which returns 0 comments.

### Key Insight
The webhook push path is the ONLY working path for comment delivery. The polling reconciler at `lib/polling/comment-reconciler.ts` is a safety net that currently cannot read comments via either API. If webhooks miss a comment, it won't be caught by polling.

### Token Types
- **IGAA token** (prefix: IGAA...): Instagram Business Login token. Works with `graph.instagram.com`. Used for: DMs, conversations, media listing, subscribed_apps.
- **Page token** (prefix: EA...): Facebook Page token. Works with `graph.facebook.com`. Used for: webhook subscription (failed), comment reading (error 33). Currently can't access IG resources.

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
