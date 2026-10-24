@AGENTS.md

# Kitverse

AI sales system for @kitversejerseys: an Instagram-DM sales bot that sounds like the owner, plus an owner admin. The storefront is not built yet. Customers are mostly Arabic-speaking (northern Palestinian / Israeli-Arab dialect, Hebrew loanwords), in Israel. One supplier: jerseyxie.x.yupoo.com. The shirts are 1:1 replicas, and the bot says so honestly.

## Stack
- Next.js 16 (App Router, `src/`, `proxy.ts` instead of middleware), TypeScript, Tailwind 4.
- Supabase Postgres (EU, Ireland). Schema lives only in `supabase/migrations/`; apply with `npm run db:push`. Never edit it in the dashboard. Migrations are additive-only on live data.
- Inngest for background work (`src/inngest/`):
  - one turn per chat burst (15s debounce, concurrency 1 per chat);
  - 3h follow-up nudge, approval decided/reminder, spend alert;
  - IG post sync every 15 min.
- Claude (`ANTHROPIC_MODEL`) runs the agent through tools (`src/lib/agent/`). **The AI never does money math**: totals come only from `src/lib/pricing/engine.ts`.
- Meta Graph API for Instagram. No WhatsApp, no Telegram. Owner alerts come from the admin (in-app and web push, `public/sw.js`).

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
- No returns or exchanges (made to order); wrong/damaged items go to the owner. Delivery: north 50, center 60, negev 70, Jerusalem area 70, West Bank + Eilat 100.
- Every discount needs an approval row (DB check). The bot's own discount limit is 0₪.
- RLS is on for every table. Staff access goes through `is_staff()`. Server actions call `requireStaff()`.
- Secrets live only in `.env.local`. Never print them. `.env.development.local` is local only: `INNGEST_DEV=1`, test webhook secret, `KV_DEV_ADMIN` (dev-only admin bypass, never works in production builds).
- Commit or push only when the user asks. Work is on branch `rebuild`. `main` and the `friend-work*` branches are the old site.

## Commands
`npm run dev` · `npm test` · `npm run typecheck` · `npm run chat -- --user x "msg"` (local bot) · `npm run eval` (needs `KV_CONVS`/`KV_HELDOUT`, costs money) · `npm run db:push` · `npm run db:seed` · `npm run staff:invite` · `npm run db:clean-tests` · `npm run catalog:build`

See `docs/RUNBOOK.md` for the go-live steps.
