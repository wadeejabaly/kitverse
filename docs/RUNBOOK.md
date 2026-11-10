# Kitverse - runbook

How the system runs and how to operate it. Commands run from `~/Desktop/kitverse`. Live at
https://kitversejerseys.com (Vercel deploys `main`; functions run in `dub1`, next to the database).

## What exists

| Part | Where |
|---|---|
| Instagram webhook (receives DMs) | `src/app/api/instagram/webhook/route.ts` |
| Background jobs (one reply per burst, follow-ups, approvals, reminders, spend alert, post sync) | `src/inngest/functions.ts`, served at `/api/inngest` |
| The bot (prompt, tools, guards, voice examples) | `src/lib/agent/` |
| Pricing engine (only source of totals) | `src/lib/pricing/engine.ts`; prices live in the database, edited in admin Pricing |
| Orders, catalog search, towns -> zones | `src/lib/orders/`, `src/lib/catalog/`, `src/lib/localities.ts` + `pricing/localities.json` |
| Website checkout (cash, PayPal, PayPlus Bit, hand-checked Bit/PayPal.Me) | `src/app/api/checkout/`, `src/lib/orders/web.ts`, `online.ts`, `manual-pay.ts` |
| Admin | `/admin` - overview, approvals, inbox, orders + supplier batches, pricing, discounts, photos, posts, test bot, stats, settings |
| Database schema | `supabase/migrations/` (apply with `npm run db:push`) |

## Day to day

- **Bot on/off** - the switch in the admin header. Off = the owner answers Instagram himself.
- **Who the bot talks to** - admin Settings: test accounts only, or everyone.
- **Bot model** - admin Settings (currently Sonnet 5.5; Opus costs more, Haiku less).
- **Prices** - admin Pricing -> edit -> "Approve & publish". The bot and checkout change at once; the
  website's shown prices follow after the automatic redeploy (~2 min).
- **Photos / hiding a shirt** - admin Photos. Both trigger the same redeploy.
- **Add an admin** - they get an email link and choose their own password (re-running it for an
  existing account just changes the name/role):
  ```bash
  npm run staff:invite -- --email someone@example.com --name "Name" --role admin
  ```
  Roles: owner | admin | staff. Every staff member sees the same shared admin.

## Test it locally

```bash
npm run dev                # http://localhost:3000 (store) and /admin
npm test                   # unit tests (pricing, guards, payments, webhook parsing...) - free
npm run typecheck
```
Talking to the bot costs Anthropic credits, so the owner and partner do it themselves: admin -> Test bot,
or `npm run chat -- --user me "msg"` in the terminal. `npm run eval` (held-out real chats) costs ~$1-2 a run.

Test orders from the simulator (`sim:` customers) are left out of the sales numbers. To delete them:
```bash
npm run db:clean-tests          # dry run, shows counts
npm run db:clean-tests -- --yes
```

## Deploys and setup

- Push to `main` -> Vercel builds (the build first exports the catalog and prices from the database).
- Environment variables live in Vercel and `.env.local` (`src/lib/env.ts` lists every one and what it
  does). `SUPABASE_DB_URL` is only for migrations; never copy `.env.development.local` to Vercel.
- Payment buttons, the WhatsApp order alert and the deploy hook each stay off until their own env vars are
  set (see `CLAUDE.md`).
- Inngest: after changing background jobs, re-sync the app in the Inngest dashboard
  (`https://kitversejerseys.com/api/inngest`).
- Meta: webhook callback `https://kitversejerseys.com/api/instagram/webhook`. Until App Review grants
  advanced access to `instagram_business_basic` + `instagram_business_manage_messages`, only accounts
  with a role on the Meta app can message the bot.
- Phone alerts: open `https://kitversejerseys.com/admin` on the phone, Add to Home Screen, open it from
  there and turn on notifications.

## Safety nets (always on)
- Prices only from the pricing engine; any amount not in the price list/quote is blocked and rewritten,
  else handed to the owner.
- No discounts without owner approval (enforced in the database); website discount codes are their own
  authority.
- Per-customer reply limits, spam block, daily spend alert and stop (admin Settings) - also set a monthly
  cap in the Anthropic console.
- The owner typing in Instagram pauses the bot in that chat for 12h.
- Every reply goes through `<reply>` extraction + money/meta/language checks before sending.
