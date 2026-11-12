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
- Meta Graph API for Instagram. Customers are only ever messaged on Instagram (no WhatsApp/Telegram to customers). Owner alerts come from the admin (in-app and web push, `public/sw.js`), plus the optional WhatsApp order alert to the owner's own number (see below).

## Storefront
- Pages/components/i18n are the shop's own (`src/app/[locale]`, `src/components`, `src/i18n`, `src/data`). Root layouts: `[locale]/layout.tsx` (store), `admin/layout.tsx`, `o/layout.tsx` - there is no `app/layout.tsx`.
- Catalog + prices are static JSON written from the database by `npm run store:export` (runs as `prebuild`): featured shirts with a checked photo -> `src/data/catalog.json`, the current price list -> `src/data/price-list.json`. `src/data/pricing.ts` reads its numbers from that file, so the site and the bot always quote the same prices.
- Checkout: `POST /api/checkout/cash/start` -> `src/lib/orders/web.ts` re-prices with the engine, saves a confirmed cash-on-delivery order (`orders.source = 'website'`), alerts the owner, returns the signed order-page token.
- Online payment (owner decision 2026-10-31, Part 7): `POST /api/checkout/paypal/start` / `/api/checkout/bit/start` -> `src/lib/orders/online.ts` (shares `prepareOrder()` in `web.ts` with cash) writes the same order but *unpaid*, then mints a PayPal order (`src/lib/payments/paypal.ts`, Orders v2 REST, redirect flow) or a PayPlus hosted payment page for Bit (`src/lib/payments/payplus.ts` + `payplus-protocol.ts`) for the exact total. Nothing is approved yet - the buyer is redirected away to pay. Settlement happens in exactly two places, both of which independently re-verify the money moved rather than trusting a redirect or a callback body: the buyer's own return (`/api/checkout/paypal/return`, `/api/checkout/bit/return`) and each provider's own webhook (`/api/paypal/webhook`, `/api/payplus/webhook`). Both call `settleOnlinePayment()` only after checking the money is for THIS order (PayPal: the return's PayPal order must be this order's pending one, and the capture must be COMPLETED, ILS, the exact total, `custom_id` = order id - `captureMatchesOrder()`), whose `payment_status = 'unpaid'` WHERE-guard makes whichever one arrives first the one that counts (a cancelled order is never reopened - the owner is told to refund; PayPal REFUNDED/REVERSED/DENIED webhooks flag the order and alert the owner); only then does the order reach `awaiting_confirmation` and the owner gets notified - same approval queue as cash, just gated on payment first. Needs 4 `PAYPAL_*` env vars and 4 `PAYPLUS_*` env vars (`src/lib/env.ts` has the full list and what each does); checkout simply doesn't show that button until its own vars are set, same as cash's own `cashEnabled` gate. `PAYPAL_ENV`/`PAYPLUS_ENV` default to sandbox - only the exact string `"live"` switches either to the real API.
- Hand-verified payments (owner requests 2026-11-10): **personal Bit** (`bit_personal`, a transfer to the owner's own Bit number - no Bit business API / PSP) and **PayPal.Me** (`paypal_me`, the owner's personal link). Neither rail can tell the site money arrived (PayPal.Me supports only `/<user>/<amount>ILS` - no note/return URL; personal Bit has no public prefilled deep link), so: `POST /api/checkout/manual/start` (`src/lib/orders/manual-pay.ts`, shares `prepareOrder()`) writes the order UNPAID/`quoted` with one pending `payments` row keyed by the browser's attempt id (unique index `payments_manual_attempt` = no duplicate orders) -> the customer lands on `/[locale]/checkout/pay?t=<token>` (amount, payee, note `KV<number>`, copy buttons, "Open Bit" = store page, PayPal.Me button) and may report a reference and/or screenshot once (`/api/checkout/manual/report`, private bucket `payment-proofs`) -> order `awaiting_payment_verification`, owner alerted, STILL unpaid -> only the owner's "Confirm payment received" on the admin order page (types the amount that arrived; a different amount is refused unless explicitly accepted) marks it paid and moves it to the normal `awaiting_confirmation` approval. "Can't find it yet" sends it back to the customer; "Not received" = payment `failed` + order cancelled; the customer can cancel before reporting. Config: admin Settings -> "Bit (personal account)" / "PayPal.Me" (`bot_settings` keys `bit_personal`, `paypal_me`; env fallback `BIT_PERSONAL_PHONE` / `PAYPAL_ME_USERNAME` only when never saved). The static checkout asks `/api/checkout/manual/methods` at runtime, so switching them needs no deploy. The official Bit logo is read from `public/brand/bit-logo.svg` when the owner adds it (text "bit" fallback until then). The PayPlus `bit` and PayPal API `paypal` rails are untouched.
- Accessories are really sold online (owner request 2026-11-10; before that checkout left them out): `src/data/accessories.json` lists keychains (per team) and scarves (`category: "scarf"`, several designs per team, `variant*` names, pages `/accessories/scarves/[handle]`; 15 club scarves in stock + the first 4 Real Madrid designs kept on the site as `inStock: false` = "Out of stock", not orderable - cart/checkout/server skip them, photos in `public/products/accessories/`). Their PRICE is the price list's per-order add-on for the category (`keychain` 18, `scarf` 50 - admin Pricing), read by `src/data/accessories.ts`; checkout sends `accessories: [{handle, qty}]`, `prepareOrder()` stores them in `order_accessories` and `requote()` prices them as order add-ons through the engine. An add-on can have `paired_price` (cheaper with a shirt, `src/lib/pricing/paired.ts`, same rule client and server): the scarf was ₪40 with a shirt, one per shirt, on 10 Nov 2026 only (Israel day). Accessories-only orders are allowed. Admin order page and the customer `/o` page list them; the WhatsApp alert and supplier batches do not.
- `src/proxy.ts`: /admin auth guard, everything else next-intl locale routing.
- Design system (owner redesign 2026-11-09, phase 1 = homepage, phase 2 = every other page): the approved homepage is the reference. Internal pages open with `PageLede` (now a full-bleed night-stadium band with breadcrumbs, `src/components/shared/PageLede.tsx` + `Breadcrumbs.tsx`), then light white-card browsing (`.kv-panel`, `.kv-pcard`, `.kv-opt`, `.kv-acc`, `.kv-table` in the `@layer components` block at the end of `globals.css`). `.btn` is the homepage's electric-blue CTA sitewide. The hero shirt is an interactive 360° showcase (owner spec + "critical fix" 2026-11-09): `src/data/showcase.ts` lists the shirts (Real Madrid first); `JerseyShowcase.tsx` lays the frames from `public/home/showcase/` on `plate.webp` (the old composite with the shirt removed). The jersey itself is the drag surface; a shirt turns only with a real turntable sequence of >= `MIN_FRAMES_FOR_360` (16, aim for 24) frames, otherwise it is shown still - never fake 360 from a front + back. Frames: `scripts/images/showcase_frames.py` + `showcase-sources.json` (`sequence` entries = fixed-camera frames, one shared transform). `test-360` is an unbranded 3D render, `demo: true`, dropped when `VERCEL_ENV=production`. Generated imagery lives in `public/home/` (Higgsfield; built from real catalog photos, never invented crests/sponsors — the retro tile is deliberately unbranded until a real retro photo exists). New pages: `/help`, `/returns`, `/contact`. `src/lib/payment-methods.ts` decides which payment methods the footer/Help/product page mention (same env tests as checkout). `localName()` (`src/lib/local-name.ts`) is the one way to show a league/team name per locale (Hebrew included).
- Known policy conflict (flagged to the owner 2026-11-09, not changed): `/terms` still says 14-day returns for unworn shirts, while `/shipping`, `/returns`, Help and the owner's spec say defective items only. The Rules line below also still says 14 days. Needs an owner/legal decision.
- Hebrew (owner decision 2026-10-26): a third storefront locale, `/he`, alongside the Arabic default and `/en` — RTL like Arabic (`src/i18n/config.ts`). `titleHe`/`teamHe`/`nameHe` fields sit beside the existing `*Ar` ones in the catalog/collections/accessories data and `Product`/`Team`/`League` types; `preferred_language` on `customers` already allows `'he'`.

## Bot flow
webhook → `storeInbound` → event → `processConversation`:
1. gate (mode / spam / rate limits / spend);
2. transcribe voice notes;
3. `runAgent` (tools; `<reply>` extraction; money, meta and language guards);
4. draft (default autonomy) or send.

Owner switch: "Bot on/off" in the admin header (`bot_settings.bot_on`). Off = the bot stays silent on Instagram; on = auto-paused chats go back to the bot and customers waiting from the last 2h get answered.

Test phase: the webhook drops every chat whose username isn't on the tester list (`src/lib/conversation/testers.ts`, admin Settings), so the real account can be connected safely. Rejected senders are cached in their own `bot_settings` row (`tester_denials`, never inside `testers`): "not on the list" until the list changes, a failed username lookup for 15 minutes only.

Approvals: `src/lib/approvals.ts` → admin `/admin/approvals` → `approval/decided`.

## Admin
- Design (admin redesign 2026-11-10): the dark side of the storefront brand - night navy (`--paper` #0a1024 like the storefront's `--flood-ground`), electric blue `--pitch-fill` #2f6bff, crest gold `--gold` for highlights, Changa / Reem Kufi from `src/lib/fonts.ts` (self-hosted). Tokens are in `src/app/admin/admin.css` under `.admin-theme` (the old token names are kept, so `pitch` = brand blue now and success green is `green`); `:root` there keeps the LIGHT palette because the customer order page `/o` also loads that file - don't change it. Primitives: `src/app/admin/ui.tsx` (PageHeader with eyebrow, Card/`.kv-card`, Kpi + Sparkline, Badge/StatusDot, Tabs, KV, `ils()`), `charts.tsx` (server SVG AreaChart/BarChart/Donut/RankList/ChartCard), `submit-button.tsx` (pending state for every form), tables use `.kv-adm-table`; `(app)/loading.tsx` + `(app)/error.tsx`. Shell: collapsible sidebar (cookie `kv_admin_nav`), phone drawer + the 5-item quick bar (`(app)/nav.tsx`). Business numbers for the dashboard and Analytics come only from `src/app/admin/metrics.ts` (sale = confirmed, not cancelled, not a `sim:` test customer). Customers (`/admin/customers`, read-only) is the one page the redesign added.
- Overview numbers use Israel days (`src/lib/time.ts`); sales skip cancelled and test-bot (`sim:`) orders. "AI cost today" / the spend cap = `agent_runs` (bot turns) + `ai_usage` (photo checks, post matching; `src/lib/ai-cost.ts`).
- Catalog page is read-only: the website list is Wadeea's `catalog/store-selection.json` (adding a shirt to it, or changing which ones are hand-picked, is still a code change + `scripts/apply-store-selection.ts`). Removing a picked shirt from being live is different (see "Deleting / hiding products" below) - that part doesn't need a code change.
- Pricing page: the owner edits every price there (shirts, extras, offers, delivery fees/days/area names) + "Approve & publish". Saving updates the live price list (bot + checkout at once) and calls the deploy hook so the website's shown prices follow.
- **Prices live only in the database price list, changed in admin Pricing.** Never hardcode a price in code, prompts or translations: website copy uses placeholders filled from `src/data/pricing.ts`; `src/data/price-list.json` is re-exported from the database on every build (editing it by hand changes nothing); `pricing/price-list.draft.json` is only the first-time seed.
- Owner photo uploads call `VERCEL_DEPLOY_HOOK_URL` (if set) so the static website catalog rebuilds.
- Discount codes (owner feature 2026-10-26): admin Discounts creates/pauses/deletes codes (percent or fixed ₪ off, optional min order / date range / max uses) in the `discount_codes` table. A shopper can type more than one at checkout, but a code only combines with others when its `stackable` column is set (checked in admin as "Can be combined with other codes") - default false, so a code works alone unless the owner opts it in; `codesCanCombine()` in `src/lib/discounts.ts` is the one rule both the checkout UI and the server enforce. `src/app/api/checkout/discount/check` previews a code; `src/lib/orders/web.ts` re-validates every code, the stacking rule, and the minimum order, then applies each as its own `adjustments` row (`kind: 'discount_code'`) when the order is placed - no owner approval needed, a code is its own authority. A code can be `first_order_only` (owner request 2026-11-10, admin "First order only"): `hasEarlierOrder(phone)` refuses it when that phone already has an order past draft that wasn't cancelled. The site-wide banner (`PromoBanner.tsx`) shows the newest active first-order-only code, read from `src/data/promo.json` (written by `store:export`, so amounts always match the code); live 2026-11-10: `WELCOME30` = ₪30 off from ₪300, and the old "3 player shirts for ₪300" `bundle_3` offer + banner were switched off.

## WhatsApp order alert
Owner decision 2026-11-02 (Part 9): the instant an order is approved (website "Approve" button, or
setting any order's status to Confirmed in admin), one WhatsApp message per shirt line goes to the
owner's own number - photo + team/title, version, size, name & number, patches. Code is in
`src/lib/notify-whatsapp.ts`, wired into `approveWebOrder`/`changeOrderStatus` in
`src/app/admin/orders-actions.ts`. It does nothing until all three of `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TO_NUMBER` are set (same "not configured yet" pattern as
PayPal/PayPlus).

**Sends free-form, not a template** (revised 2026-11-02, same day): the original plan needed an
approved message template, which needs Meta Business Verification, which needs a registered legal
business - the owner doesn't have one yet ("WABA not allowed to manage templates" blocked template
creation entirely). So the code sends a plain image+caption (or plain text) message instead - no
template, no approval, no business verification. The tradeoff: WhatsApp only lets a business message
a number *freely* if that number messaged *it* first within the last 24 hours. The owner must
message the connected WhatsApp number once (any text) to open that window; alerts sent outside it
fail silently (logged only) until he messages it again. If the business gets registered later, an
approved template is the sturdier long-term option (no daily re-opt-in) - see git history for the
template version of this file if that's worth reviving then.

To turn it on:
1. A Meta Business Account + the WhatsApp Business Platform set up on it, with a phone number
   connected (can be a new number - it only ever sends to the owner, never to a customer). WhatsApp
   Manager's Phone numbers / API Setup page gives the **phone number ID**; generate a **permanent
   access token** for a System User with `whatsapp_business_messaging` - these become
   `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN`. `WHATSAPP_TO_NUMBER` is the owner's own
   WhatsApp number, E.164 (e.g. `9725XXXXXXXX`).
2. Set the three env vars in Vercel (I can do this part once given the values) and redeploy.
3. The owner messages the connected WhatsApp number from his phone once (opens the 24h window),
   then approves an order to test. Re-message it whenever more than a day has passed since the last
   alert and a new one doesn't arrive.

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

Catalogue photos are standardized (1200x1200, shirt centred on flat #F1F3F7, owner spec 2026-11-09): `scripts/images/standardize.py`, admin uploads via `catalog/image-overrides.json` + `public/products/std/`, see `docs/image-standardization.md`. Product tiles are flat #F1F3F7 with the photo filling the square, so new photos should go through the tool too.

Never send supplier images directly. Kids items are shown only when the customer asks for kids. Commands: `npm run photos:screen`, `npm run photos:verify-teams`.

**Committed-file galleries silently lose to a single admin upload (found + fixed 2026-11-03).** As soon as a product has ANY row in `product_images` (even just one owner upload of the main photo), `export-store-catalog.ts`'s `migrated` flag flips to true for that product and it stops reading `catalog/store-selection.json`'s `images`/`imagesLongSleeve` fields *at all* - a product can have a rich gallery committed as files + JSON and still show just the one admin-uploaded photo on the site, with no error anywhere. Found when the owner reported Bayern Munich showing only 1 photo; turned out 55 products across the catalog had this gap (owner had uploaded one photo each via admin at some point, orphaning the committed JSON galleries). Fixed by inserting the missing `images`/`imagesLongSleeve` paths directly as `product_images` rows (`source: 'real'`, relative `/products/...` urls - no Storage upload needed, same as how `image` already works for a non-migrated product) rather than editing the JSON, then redeploying. **Going forward: once a product has any `product_images` row, adding photos for it means inserting `product_images` rows (or using admin's own upload), never editing `catalog/store-selection.json`'s `images`/`imagesLongSleeve` - that JSON path only still works for a product with zero DB photo rows.** `scripts/migrate-real-photos.ts` exists for this but has never actually been run (zero `source:'real'` rows existed before this fix) and would currently re-insert a duplicate primary row for any product that already has an owner-upload primary - needs that guard fixed before it's safe to run broadly.

## Deleting / hiding products
Owner decision 2026-11-02: admin Photos -> "Manage shirts" (`src/app/admin/photos-actions.ts`:
`deleteProduct`/`bulkDeleteProducts`/`bulkSetProductsHidden`) lets the owner delete a shirt (`products`
row + its images/options/post-matches, blocked only when it has order history - `order_items.product_id`
has no cascade on purpose) or set its status to `hidden` (never returned by `search_catalog`, refused
in a draft order, dropped from a web checkout line - `src/lib/catalog/search.ts`/`orders/draft.ts`/
`orders/web.ts`), and both now work on a *website* ("featured") shirt too, not just bot-only ones.

That works without editing `catalog/store-selection.json` because `scripts/export-store-catalog.ts`
skips any selection entry whose row is gone or `hidden` when it builds `src/data/catalog.json` -
deleting/hiding a website shirt fires the deploy hook (same ~2 min as a photo upload) and it drops off
the site on the next build, even though the JSON file still lists its handle. That file stays the
record of WHICH shirts are hand-picked; the DB row now just controls whether a picked one is actually
live. Un-hiding (status back to `available`) brings it right back, same way.

Caveat: `scripts/apply-store-selection.ts` (used when Wadeea changes the hand-picked list) still
matches purely by handle - if it's ever re-run, it will recreate a *deleted* shirt as a new row from
its still-there `catalog/store-selection.json` entry (a *hidden* one isn't affected, re-running that
script doesn't touch `status`). If a deleted shirt should stay gone for good even through a future
re-sync, its entry needs removing from that file too - a code change, same as adding one.

## Rules
- Money is stored in agorot as integers.
- Prices: see admin Pricing (as of 2026-11-02 live: fan 95, player 110, retro 135, long sleeve via the *_long groups, name+number 19.99, patches 12.99 / 9.99 / 6.99 for the 1st/2nd/3rd on a shirt, 3XL +9 / 4XL +12, gift box 34.99, no 3-for-300; delivery north 50, elsewhere 70). Delivery 7-14 days (up to 20 outside the north). Returns: 14 days, unworn with tags; printed shirts only if wrong/faulty.
- Patches (owner decision 2026-10-26): a shopper picks a SET of patches per shirt from a small photo picker (club shirts up to 2, one per sleeve - except La Liga 2025/26 and 2026/27 shirts, only 1 (owner decision 2026-11-10; picking another swaps it); national-team shirts up to 3 — World Cup, Peace and Champions badges; the one cap rule is `src/lib/patch-limits.ts`). Priced by COUNT on the shirt, tiered: 1st patch 12.99, 2nd 9.99, 3rd 6.99 (`Addon.price_tiers`, set in admin Pricing, consumed by `lib/pricing/tiers.ts`). Champions League has two options (owner decision 2026-11-12): `champions_league` (the plain patch) and `champions_league_full` = the full match version, one generic option for every club shirt - the supplier applies the badges that season wore (titles badge / sponsor patch vary by season, nobody looks them up per shirt); it goes on the shirt ALONE and is charged as 3 patches on retro shirts, 2 on current ones (`patchPieces()` in `src/lib/patch-limits.ts`, used by the product form, cart, checkout and `requote()`). Patch ids and which team type each is for live in `lib/orders/rules.ts` (`PATCHES`/`checkPatches`, already shared with the Instagram bot); which ids have storefront artwork and which leagues/clubs they're offered for live in `src/data/patches.ts`; art is `public/patches/*.jpg`.
- Every discount needs an approval row (DB check), except website discount codes (`kind: 'discount_code'`, the code is its own authority). The bot's own discount limit is 0₪. A code's use is claimed with a compare-and-set (`recordDiscountCodeUse`): cash orders when placed, PayPal/Bit only once paid.
- RLS is on for every table. Staff access goes through `is_staff()`. Server actions call `requireStaff()`.
- Never spend the Anthropic API credits from an agent session: no `npm run chat`, `npm run eval`, `photos:screen`/`photos:verify-teams`, admin Test bot or webhook messages that make the bot reply. The owner and partner test the bot. Do one-off visual review in the chat instead (e.g. `scripts/photo-sheets.ts` + `scripts/apply-photo-picks.ts`).
- Secrets live only in `.env.local`. Never print them. `.env.development.local` is local only: `INNGEST_DEV=1`, test webhook secret, `KV_DEV_ADMIN` (dev-only admin bypass, never works in production builds).
- Commit or push only when the user asks. Work on `main` (the `site` branch is merged and retired); Vercel deploys `main` to production. Only one agent session should change `main` at a time. (The old shop backend's PayPal/PayPlus routes were deleted and then deliberately rebuilt - owner decision 2026-10-31, Part 7, see "Online payment" above - against the *current* orders/payments schema, not the old flat-column one. That rule is retired; don't re-flag it.)

## Commands
`npm run dev` · `npm run store:export` · `npm test` · `npm run typecheck` · `npm run chat -- --user x "msg"` (local bot) · `npm run eval` (needs `KV_CONVS`/`KV_HELDOUT`, costs money) · `npm run db:push` · `npm run db:seed` · `npm run staff:invite` · `npm run db:clean-tests` · `npm run catalog:build`

See `docs/RUNBOOK.md` for the go-live steps.
