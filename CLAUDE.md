@AGENTS.md

# Kitverse

AI sales system for @kitversejerseys: an Instagram-DM sales bot that sounds like the owner, an owner admin, and the storefront (Wadeea's design, `src/app/[locale]`, Arabic default + /en). One app, one database: website and Instagram orders land in the same orders table and admin. Customers are mostly Arabic-speaking (northern Palestinian / Israeli-Arab dialect, Hebrew loanwords), in Israel. One supplier: jerseyxie.x.yupoo.com. The shirts are 1:1 replicas, and the bot says so honestly.

## Stack
- Next.js 16 (App Router, `src/`, `proxy.ts` instead of middleware), TypeScript, Tailwind 4.
- Supabase Postgres (EU, Ireland). Schema lives only in `supabase/migrations/`; apply with `npm run db:push`. Never edit it in the dashboard. Migrations are additive-only on live data.
- Inngest for background work (`src/inngest/`):
  - one turn per chat burst (15s debounce, concurrency 1 per chat);
  - 3h follow-up nudge, approval decided/reminder, spend alert;
  - IG post sync every 15 min.
- Claude (`ANTHROPIC_MODEL`) runs the agent through tools (`src/lib/agent/`). **The AI never does money math**: totals come only from `src/lib/pricing/engine.ts`.
- Meta Graph API for Instagram. No WhatsApp, no Telegram. Owner alerts come from the admin (in-app and web push, `public/sw.js`).

## Storefront
- Pages/components/i18n are the shop's own (`src/app/[locale]`, `src/components`, `src/i18n`, `src/data`). Root layouts: `[locale]/layout.tsx` (store), `admin/layout.tsx`, `o/layout.tsx` - there is no `app/layout.tsx`.
- Catalog + prices are static JSON written from the database by `npm run store:export` (runs as `prebuild`): featured shirts with a checked photo -> `src/data/catalog.json`, the current price list -> `src/data/price-list.json`. `src/data/pricing.ts` reads its numbers from that file, so the site and the bot always quote the same prices.
- Checkout: `POST /api/checkout/cash/start` -> `src/lib/orders/web.ts` re-prices with the engine, saves a confirmed cash-on-delivery order (`orders.source = 'website'`), alerts the owner, returns the signed order-page token. No PayPal/PayPlus yet.
- `src/proxy.ts`: /admin auth guard, everything else next-intl locale routing.

## Bot flow
webhook → `storeInbound` → event → `processConversation`:
1. gate (mode / spam / rate limits / spend);
2. transcribe voice notes;
3. `runAgent` (tools; `<reply>` extraction; money, meta and language guards);
4. draft (default autonomy) or send.

Test phase: the webhook drops every chat whose username isn't on the tester list (`src/lib/conversation/testers.ts`, admin Settings), so the real account can be connected safely.

Approvals: `src/lib/approvals.ts` → admin `/admin/approvals` → `approval/decided`.

## Photos
Customers only ever see photos that passed `src/lib/catalog/photo-qa.ts`:
- no added text, labels or watermarks;
- not kids or baby items for adult requests;
- front view and attractive;
- the crest has been confirmed as the right team. Supplier albums are sometimes mislabelled.

Never send supplier images directly. Kids items are shown only when the customer asks for kids. Commands: `npm run photos:screen`, `npm run photos:verify-teams`.

## Rules
- Money is stored in agorot as integers.
- Prices = the website's (owner-approved 2026-10-24): fan 95, player 110, retro (2023 and older) 135, name+number 20, patch 11.99, 3XL +9 / 4XL +12, gift box 34.99 per box, no 3-for-300 offer. Delivery 7-14 days (Jerusalem/West Bank/south up to 20): north 50, center 60, negev 70, Jerusalem + West Bank + Eilat 100. Returns: 14 days, unworn with tags; printed shirts only if wrong/faulty.
- Every discount needs an approval row (DB check). The bot's own discount limit is 0₪.
- RLS is on for every table. Staff access goes through `is_staff()`. Server actions call `requireStaff()`.
- Never spend the Anthropic API credits from an agent session: no `npm run chat`, `npm run eval`, `photos:screen`/`photos:verify-teams`, admin Test bot or webhook messages that make the bot reply. The owner and partner test the bot. Do one-off visual review in the chat instead (e.g. `scripts/photo-sheets.ts` + `scripts/apply-photo-picks.ts`).
- Secrets live only in `.env.local`. Never print them. `.env.development.local` is local only: `INNGEST_DEV=1`, test webhook secret, `KV_DEV_ADMIN` (dev-only admin bypass, never works in production builds).
- Commit or push only when the user asks. `site` = merged app (store + bot + admin), meant to become `main`. Never bring back the old shop backend (Supabase orders tables, PayPal/PayPlus routes) - the user had it deleted.

## Commands
`npm run dev` · `npm run store:export` · `npm test` · `npm run typecheck` · `npm run chat -- --user x "msg"` (local bot) · `npm run eval` (needs `KV_CONVS`/`KV_HELDOUT`, costs money) · `npm run db:push` · `npm run db:seed` · `npm run staff:invite` · `npm run db:clean-tests` · `npm run catalog:build`

See `docs/RUNBOOK.md` for the go-live steps.
