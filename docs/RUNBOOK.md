# Kitverse - runbook

How the system runs, how to test it, and the steps to go live. Commands run from `~/Desktop/kitverse`.

## What exists

| Part | Where |
|---|---|
| Instagram webhook (receives DMs) | `src/app/api/instagram/webhook/route.ts` |
| Background jobs (one reply per burst, follow-ups, approvals, reminders, spend alert, post sync) | `src/inngest/functions.ts`, served at `/api/inngest` |
| The bot (prompt, tools, guards, voice examples) | `src/lib/agent/` |
| Pricing engine (only source of totals) | `src/lib/pricing/engine.ts` + `pricing/price-list.draft.json` |
| Orders, catalog search, towns -> zones | `src/lib/orders/`, `src/lib/catalog/`, `src/lib/localities.ts` |
| Admin (Arabic/English, phone-first) | `/admin` - approvals, inbox, orders + supplier sheet, posts, test chat, settings |
| Database schema | `supabase/migrations/` (apply with `npm run db:push`) |

## Test it locally (no Instagram needed)

```bash
npm run chat -- --user me "مرحبا قديش بلوزة برشلونة؟"     # talk to the bot in the terminal
npm run chat -- --user me --reset                        # start over
npm test                                                  # 34 unit tests (pricing, guards, webhook parsing...)
npm run eval -- --cases 20                                # voice/quality eval on held-out real chats (costs ~$1-2; needs KV_CONVS/KV_HELDOUT)
```
Or run the app (`npm run dev`) and open http://localhost:3000/admin/test-chat.

## Go-live steps (only you / the owner can do these)

1. **Admin logins** - for you and the owner:
   ```bash
   npm run staff:invite -- --email you@example.com --name "Omar" --role admin
   npm run staff:invite -- --email owner@example.com --name "Raji" --role owner
   ```
   Each gets an email link and chooses their own password. (Set `NEXT_PUBLIC_SITE_URL` to the live URL first so the link points there.)
2. **Deploy to Vercel** - import the GitHub repo, add every value from `.env.local` as Vercel environment variables (except `SUPABASE_DB_URL`, which only migrations need), deploy. Do NOT copy `.env.development.local`.
3. **Inngest** - in the Inngest dashboard: Apps -> Sync new app -> `https://<your-domain>/api/inngest`.
4. **Meta app** (developers.facebook.com):
   - Create app -> add "Instagram" product -> "API setup with Instagram login".
   - Connect @kitversejerseys (must be a Professional account). Generate a token -> `INSTAGRAM_ACCESS_TOKEN`, account id -> `INSTAGRAM_ACCOUNT_ID`, app secret -> `META_APP_SECRET`.
   - Webhooks: callback `https://<your-domain>/api/instagram/webhook`, verify token = any phrase you put in `META_WEBHOOK_VERIFY_TOKEN`. Subscribe to the messaging fields: messages (incl. echoes), reactions, postbacks, referrals (exact field names as shown in Meta's webhook UI).
   - On the owner's phone: Instagram -> Settings -> Messages and story replies -> Message controls / Connected tools -> **Allow access to messages**.
   - App Review: request advanced access for `instagram_business_basic` and `instagram_business_manage_messages`. Needs: privacy policy URL (site), a screen recording of the bot answering a DM and the admin approving it. Until approved, only accounts with a role on the app can message the bot - use your own accounts to test.
   - **Test phase:** admin → Settings → "Who the bot talks to" = Test accounts only (default). The bot ignores everyone not listed (not stored, not answered), so @kitversejerseys can be connected while the owner keeps selling by hand. Switch to "Everyone" at launch.
5. **Phone alerts** - on the owner's phone open `https://<your-domain>/admin`, iPhone: Share -> Add to Home Screen, then open it from the home screen and tap "تفعيل الإشعارات".
6. **Before real customers** - review and publish the price list (still a draft), review delivery towns (`pricing/localities.json`), then remove test data:
   ```bash
   npm run db:clean-tests -- --yes
   ```
7. **Launch in draft mode** (default): the bot writes every reply, the owner taps "ابعت" in the admin. When happy: Settings -> "البوت برد لحاله".

## Safety nets (already on)
- Prices only from the pricing engine; any amount not in the price list/quote is blocked and rewritten, else handed to the owner.
- No discounts without owner approval (enforced in the database).
- Per-customer reply limits, spam block, $10/day alert, $25/day stop (+ set a monthly cap in the Anthropic console).
- The owner typing in Instagram pauses the bot in that chat for 12h.
- Every reply goes through `<reply>` extraction + meta/language checks before sending.
