@AGENTS.md

# Kitverse

AI sales system for @kitversejerseys: an Instagram-DM sales bot that sounds like the owner, an owner admin, and the storefront (Wadeea's design, `src/app/[locale]`, Arabic default + /en + /he). One app, one database: website and Instagram orders land in the same orders table and admin. Customers are mostly Arabic-speaking (northern Palestinian / Israeli-Arab dialect, Hebrew loanwords), in Israel. One supplier: jerseyxie.x.yupoo.com. The shirts are 1:1 replicas, and the bot says so honestly.

## Stack
- Next.js 16 (App Router, `src/`, `proxy.ts` instead of middleware), TypeScript, Tailwind 4.
- Supabase Postgres (EU, Ireland). Schema lives only in `supabase/migrations/`; apply with `npm run db:push`. Never edit it in the dashboard. Migrations are additive-only on live data.
- Inngest for background work (`src/inngest/`):
  - one turn per chat burst (5s debounce, shows "seen" + typing while it works, concurrency 1 per chat);
  - 3h follow-up nudge, approval decided/reminder, spend alert;
  - IG post sync every 15 min.
- Claude runs the agent (model picked in admin Settings -> `bot_settings.ai_model`: Opus 5.5 / Sonnet 5.5 / Haiku 5.5; default `ANTHROPIC_MODEL`) through tools (`src/lib/agent/`). **The AI never does money math**: totals come only from `src/lib/pricing/engine.ts`.
- Meta Graph API for Instagram. No WhatsApp, no Telegram. Owner alerts come from the admin (in-app and web push, `public/sw.js`).

## Storefront
- Pages/components/i18n are the shop's own (`src/app/[locale]`, `src/components`, `src/i18n`, `src/data`). Root layouts: `[locale]/layout.tsx` (store), `admin/layout.tsx`, `o/layout.tsx` - there is no `app/layout.tsx`.
- Catalog + prices are static JSON written from the database by `npm run store:export` (runs as `prebuild`): featured shirts with a checked photo -> `src/data/catalog.json`, the current price list -> `src/data/price-list.json`. `src/data/pricing.ts` reads its numbers from that file, so the site and the bot always quote the same prices.
- Checkout: `POST /api/checkout/cash/start` -> `src/lib/orders/web.ts` re-prices with the engine, saves a confirmed cash-on-delivery order (`orders.source = 'website'`), alerts the owner, returns the signed order-page token.
- Online payment (owner decision 2026-10-31, Part 7): `POST /api/checkout/paypal/start` / `/api/checkout/bit/start` -> `src/lib/orders/online.ts` (shares `prepareOrder()` in `web.ts` with cash) writes the same order but *unpaid*, then mints a PayPal order (`src/lib/payments/paypal.ts`, Orders v2 REST, redirect flow) or a PayPlus hosted payment page for Bit (`src/lib/payments/payplus.ts` + `payplus-protocol.ts`) for the exact total. Nothing is approved yet - the buyer is redirected away to pay. Settlement happens in exactly two places, both of which independently re-verify the money moved rather than trusting a redirect or a callback body: the buyer's own return (`/api/checkout/paypal/return`, `/api/checkout/bit/return`) and each provider's own webhook (`/api/paypal/webhook`, `/api/payplus/webhook`). Both call `settleOnlinePayment()`, whose `payment_status = 'unpaid'` WHERE-guard makes whichever one arrives first the one that counts; only then does the order reach `awaiting_confirmation` and the owner gets notified - same approval queue as cash, just gated on payment first. Needs 4 `PAYPAL_*` env vars and 4 `PAYPLUS_*` env vars (`src/lib/env.ts` has the full list and what each does); checkout simply doesn't show that button until its own vars are set, same as cash's own `cashEnabled` gate. `PAYPAL_ENV`/`PAYPLUS_ENV` default to sandbox - only the exact string `"live"` switches either to the real API.
- `src/proxy.ts`: /admin auth guard, everything else next-intl locale routing.
- Hebrew (owner decision 2026-10-26): a third storefront locale, `/he`, alongside the Arabic default and `/en` — RTL like Arabic (`src/i18n/config.ts`). `titleHe`/`teamHe`/`nameHe` fields sit beside the existing `*Ar` ones in the catalog/collections/accessories data and `Product`/`Team`/`League` types; `preferred_language` on `customers` already allows `'he'`.

## Bot flow
webhook → `storeInbound` → event → `processConversation`:
1. gate (mode / spam / rate limits / spend);
2. transcribe voice notes;
3. `runAgent` (tools; `<reply>` extraction; money, meta and language guards);
4. draft (default autonomy) or send.

Owner switch: "Bot on/off" in the admin header (`bot_settings.bot_on`). Off = the bot stays silent on Instagram; on = auto-paused chats go back to the bot and customers waiting from the last 2h get answered.

Test phase: the webhook drops every chat whose username isn't on the tester list (`src/lib/conversation/testers.ts`, admin Settings), so the real account can be connected safely.

Approvals: `src/lib/approvals.ts` → admin `/admin/approvals` → `approval/decided`.

## Admin
- Overview numbers use Israel days (`src/lib/time.ts`); sales skip cancelled and test-bot (`sim:`) orders. "AI cost today" / the spend cap = `agent_runs` (bot turns) + `ai_usage` (photo checks, post matching; `src/lib/ai-cost.ts`).
- Catalog page is read-only: the website list is Wadeea's `catalog/store-selection.json` (changing it is a code change + `scripts/apply-store-selection.ts`).
- Pricing page: the owner edits every price there (shirts, extras, offers, delivery fees/days/area names) + "Approve & publish". Saving updates the live price list (bot + checkout at once) and calls the deploy hook so the website's shown prices follow.
- **Prices live only in the database price list, changed in admin Pricing.** Never hardcode a price in code, prompts or translations: website copy uses placeholders filled from `src/data/pricing.ts`; `src/data/price-list.json` is re-exported from the database on every build (editing it by hand changes nothing); `pricing/price-list.draft.json` is only the first-time seed.
- Owner photo uploads call `VERCEL_DEPLOY_HOOK_URL` (if set) so the static website catalog rebuilds.
- Discount codes (owner feature 2026-10-26): admin Discounts creates/pauses/deletes codes (percent or fixed ₪ off, optional min order / date range / max uses) in the `discount_codes` table. A shopper can type more than one at checkout, but a code only combines with others when its `stackable` column is set (checked in admin as "Can be combined with other codes") - default false, so a code works alone unless the owner opts it in; `codesCanCombine()` in `src/lib/discounts.ts` is the one rule both the checkout UI and the server enforce. `src/app/api/checkout/discount/check` previews a code; `src/lib/orders/web.ts` re-validates every code, the stacking rule, and the minimum order, then applies each as its own `adjustments` row (`kind: 'discount_code'`) when the order is placed - no owner approval needed, a code is its own authority.

## WhatsApp order alert
Owner decision 2026-11-02 (Part 9): the instant an order is approved (website "Approve" button, or
setting any order's status to Confirmed in admin), one WhatsApp message per shirt line goes to the
owner's own number - photo + team/title, version, size, name & number, patches. Code is in
`src/lib/notify-whatsapp.ts`, wired into `approveWebOrder`/`changeOrderStatus` in
`src/app/admin/orders-actions.ts`. It does nothing until all three of `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TO_NUMBER` are set (same "not configured yet" pattern as
PayPal/PayPlus) - **not yet set up as of this writing**.

To turn it on, the owner needs to do this in Meta's own tools (none of it can be done from here):
1. A Meta Business Account + the WhatsApp Business Platform set up on it, with a phone number
   verified for WhatsApp (can be a new number - it only ever sends to the owner, never to a
   customer). Meta's WhatsApp Manager gives a **phone number ID** and lets you generate a
   **permanent access token** - these become `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN`.
   `WHATSAPP_TO_NUMBER` is the owner's own WhatsApp number, E.164 (e.g. `9725XXXXXXXX`).
2. In WhatsApp Manager, create and submit for approval a message **template** (category: Utility)
   named to match `WHATSAPP_TEMPLATE_NAME` (defaults to `order_item_alert` if left unset), English,
   with:
   - **Header**: Image
   - **Body**, exactly 6 placeholders in this order: order number, shirt (team + title), version
     (Fan/Player), size, name & number (or "-"), patches (or "-"). Example body text:
     `New order #{{1}}\n{{2}}\nVersion: {{3}}\nSize: {{4}}\nName & number: {{5}}\nPatches: {{6}}`
   A template is required because this is a business-initiated message outside any 24-hour customer
   window - a plain freeform message would simply fail. Usually approved within minutes to a day.
3. Set the four env vars in Vercel (I can do this part once given the values) and redeploy.

## Photos
`product_images.sleeve` ('short'/'long', owner decision 2026-11-02, Part 8): the storefront gallery is
two separate sets, not one list - picking "Long sleeve" on a product page swaps the whole thumbnail
row to that shirt's long-sleeve photos (`ProductGallery.tsx`/`ProductSleeveContext.tsx`), so every
photo in product_images belongs to one set or the other. "Front of a sleeve group" = lowest `sort`
within that (product, sleeve) pair; admin's "All photos" (`src/app/admin/(app)/photos/photo-manager.tsx`)
shows and manages the two groups separately, and `primary_image_url`/`photo_status` only ever track the
short-sleeve group's front photo. `scripts/export-store-catalog.ts` builds `images`/`imagesLongSleeve`
from product_images grouped this way, falling back to the old JSON-only path (below) for any product
not yet migrated. `scripts/migrate-real-photos.ts` is the one-off, idempotent, re-runnable migration
that brought the catalog's ~700 committed "real" photos into the database this way (owner report
2026-11-02: "there are photos in the website that dont appear in the admin" - those photos lived only
as files + catalog/store-selection.json's `images`/`imagesLongSleeve` fields, invisible to admin).

Customers only ever see photos that passed `src/lib/catalog/photo-qa.ts`:
- no added text, labels or watermarks;
- not kids or baby items for adult requests;
- front view and attractive;
- the crest has been confirmed as the right team. Supplier albums are sometimes mislabelled.

Never send supplier images directly. Kids items are shown only when the customer asks for kids. Commands: `npm run photos:screen`, `npm run photos:verify-teams`.

## Rules
- Money is stored in agorot as integers.
- Prices: see admin Pricing (as of 2026-10-26 live: fan 95, player 110, retro 135, name+number 19.99, patch 11.99 flat, 3XL +9 / 4XL +12, gift box 34.99, no 3-for-300; delivery north 50, elsewhere 70 - the owner's tiered patch prices 12.99/9.99/6.99 still need setting in admin Pricing). Delivery 7-14 days (up to 20 outside the north). Returns: 14 days, unworn with tags; printed shirts only if wrong/faulty.
- Patches (owner decision 2026-10-26): a shopper picks a SET of patches per shirt from a small photo picker (club shirts up to 2, one per sleeve; national-team shirts up to 3 — World Cup, Peace and Champions badges). Priced by COUNT on the shirt, tiered: 1st patch 12.99, 2nd 9.99, 3rd 6.99 (`Addon.price_tiers`, set in admin Pricing, consumed by `lib/pricing/tiers.ts`). Patch ids and which team type each is for live in `lib/orders/rules.ts` (`PATCHES`/`checkPatches`, already shared with the Instagram bot); which ids have storefront artwork and which leagues/clubs they're offered for live in `src/data/patches.ts`; art is `public/patches/*.jpg`.
- Every discount needs an approval row (DB check). The bot's own discount limit is 0₪.
- RLS is on for every table. Staff access goes through `is_staff()`. Server actions call `requireStaff()`.
- Never spend the Anthropic API credits from an agent session: no `npm run chat`, `npm run eval`, `photos:screen`/`photos:verify-teams`, admin Test bot or webhook messages that make the bot reply. The owner and partner test the bot. Do one-off visual review in the chat instead (e.g. `scripts/photo-sheets.ts` + `scripts/apply-photo-picks.ts`).
- Secrets live only in `.env.local`. Never print them. `.env.development.local` is local only: `INNGEST_DEV=1`, test webhook secret, `KV_DEV_ADMIN` (dev-only admin bypass, never works in production builds).
- Commit or push only when the user asks. Work on `main` (the `site` branch is merged and retired); Vercel deploys `main` to production. Only one agent session should change `main` at a time. (The old shop backend's PayPal/PayPlus routes were deleted and then deliberately rebuilt - owner decision 2026-10-31, Part 7, see "Online payment" above - against the *current* orders/payments schema, not the old flat-column one. That rule is retired; don't re-flag it.)

## Commands
`npm run dev` · `npm run store:export` · `npm test` · `npm run typecheck` · `npm run chat -- --user x "msg"` (local bot) · `npm run eval` (needs `KV_CONVS`/`KV_HELDOUT`, costs money) · `npm run db:push` · `npm run db:seed` · `npm run staff:invite` · `npm run db:clean-tests` · `npm run catalog:build`

See `docs/RUNBOOK.md` for the go-live steps.
