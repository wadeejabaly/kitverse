@AGENTS.md

# Kitverse

AI sales system for @kitversejerseys (football shirts, Israel): an Instagram-DM sales bot that sounds like the owner, an owner admin, and the storefront kitversejerseys.com (Arabic default + /en + /he). One app, one database: website and Instagram orders land in the same orders table and admin. Customers are mostly Arabic-speaking (northern Palestinian / Israeli-Arab dialect), in Israel. One supplier: jerseyxie.x.yupoo.com. The shirts are 1:1 replicas, and the bot says so honestly.

**Read only what the task needs.** This file is the map; the details live in `docs/`:

| Task touches | Read |
|---|---|
| Website pages, checkout, payments (cash / PayPal / Bit / PayPal.Me), accessories, bundles, kits, order page `/o`, tracking timeline, header/nav, languages, Meta Pixel, design system | `docs/storefront.md` |
| Admin pages, profit, adding shirts, pricing page, discount codes, Black Friday look | `docs/admin.md` |
| Prices, patches, discount stacking, free delivery, rounding, PayPal fee | `docs/pricing-rules.md` |
| DM bot, Inngest jobs, Instagram autopost / riddle / polls, messaging customers | `docs/instagram.md` |
| Product photos, standardizing images, hiding/deleting shirts | `docs/catalog-photos.md`, `docs/image-standardization.md` |
| WhatsApp order alerts to the owner | `docs/whatsapp-alert.md` |
| Env vars / go-live | `docs/RUNBOOK.md` |

## Stack
- Next.js 16 (App Router, `src/`, `src/proxy.ts` instead of middleware), TypeScript, Tailwind 4. Read `node_modules/next/dist/docs/` before using unfamiliar Next APIs (see AGENTS.md).
- Supabase Postgres (project `kbzpzggsedliunhjegyj`, EU). Schema lives only in `supabase/migrations/`; apply with `npm run db:push` (or the Supabase MCP `apply_migration`). Never edit it in the dashboard. Migrations are additive-only on live data.
- Inngest for background work (`src/inngest/`) - see `docs/instagram.md`.
- Claude runs the agent (model picked in admin Settings -> `bot_settings.ai_model`; default `ANTHROPIC_MODEL`) through tools (`src/lib/agent/`). **The AI never does money math**: totals come only from `src/lib/pricing/engine.ts`.
- Vercel project `prj_Xw7ipGvTOzxa9X5bC4U6WHmvYsgR`, team `team_6guviQzi1wSId1ulzAF8nkoR`; deploys `main` to production. Build ≈ 1 min: `prebuild` = `scripts/export-store-catalog.ts` (DB -> `src/data/catalog.json`, `price-list.json`, `promo.json`), then `next build` (~1,100 static pages).

## Where things live
- `src/app/[locale]/` storefront pages · `src/app/admin/` admin (`(app)/` pages, `*-actions.ts` server actions, `ui.tsx` primitives, `metrics.ts` business numbers) · `src/app/o/` customer order page · `src/app/api/` checkout, webhooks, Inngest.
- `src/lib/orders/` orders (web checkout, manual pay, online pay, requote/draft, customer timeline, ETA, WhatsApp texts) · `src/lib/pricing/` engine · `src/lib/catalog/` search, names, stock · `src/lib/agent/` bot · `src/lib/channels/` Instagram.
- `src/components/` storefront UI · `src/i18n/messages/{ar,en,he}.json` all site text · `src/data/` generated JSON (catalog, price list, promo - rebuilt every deploy, never hand-edit) + hand-kept data (accessories, bundles, ig-schedule, localities).
- `public/products/` shirt photos (`<handle>.jpg`, `-2`, `-long`, `-back`; `std/` = standardized admin uploads) · `public/campaign/` Instagram campaign images still scheduled · `public/home/` hero film + Black Friday art.
- `catalog/` website selection + collections + image overrides · `scripts/` build/export + image tools (`scripts/images/standardize.py`) · `supabase/migrations/`.

## Shipping a change (the workflow that works)
1. Work in a clone of `wadeejabaly/kitverse` (`git clone --filter=blob:none` is much faster than a full clone - the history holds ~300 MB of old images). If node_modules is missing: `npm install --no-audit --no-fund --package-lock=false --ignore-scripts`.
2. Check: `npx vitest run` and `npx tsc --noEmit` (the `PageProps`/`RouteContext` errors are Next type generation, ignore them; `npm run typecheck` generates them properly). Lint only the touched files with `npx eslint <files>`.
3. Commit as `Claude <noreply@anthropic.com>` with the session's attribution trailer, push to `main` (Vercel deploys in ~1 min). If the cloud sandbox can't push (git proxy 403 = repo not added to the session's sources), hand the commit over as a patch: `git format-patch -1 --stdout > x.patch` -> send the file -> write it to the owner's Desktop -> on his Mac `cd ~/mnt/Desktop/kitverse && git fetch -q origin && git merge -q --ff-only origin/main && git -c gc.auto=0 am -q ../x.patch` (git there needs delete permission for the Desktop folder, else it leaves `.lock` files), then the owner clicks **Push origin** in GitHub Desktop.
4. Data-only changes (new shirt rows, discount codes, order fixes) go straight to the database with the Supabase MCP - but a new product PHOTO is a file in `public/products/`, so it still needs a commit + deploy. Redeploy without a code change: Vercel MCP `create_deployment` with the latest production `deploymentId`, `target: "production"`, `withLatestCommit: true`.
5. Adding a shirt to the site: reuse the supplier's existing `products` row when there is one (same team/season/kit), else insert one; set `status 'featured'`, flags `site_listed` + `owner_catalog` (+ `not_at_supplier` if the supplier doesn't list it), `title_he`, `primary_image_url`, `photo_status 'owner_upload'`; add `product_options` (fan/player, short/long) and `product_images` rows; photo through `scripts/images/standardize.py` into `public/products/<handle>.jpg`. Names follow `shirtNames()` (`src/lib/catalog/shirt-names.ts`). `search_text` is a generated column - don't insert it.

## Rules
- Money is stored in agorot as integers. Prices live only in the database price list (admin Pricing) - never hardcode one in code, prompts or translations. Details: `docs/pricing-rules.md`.
- RLS is on for every table. Staff access goes through `is_staff()`. Server actions call `requireStaff()`.
- Never spend the Anthropic API credits from an agent session: no `npm run chat`, `npm run eval`, `photos:screen`/`photos:verify-teams`, admin Test bot or webhook messages that make the bot reply. The owner and partner test the bot. Do one-off visual review in the chat instead (e.g. `scripts/photo-sheets.ts` + `scripts/apply-photo-picks.ts`).
- Secrets live only in `.env.local` / Vercel env. Never print them. `.env.development.local` is local only: `INNGEST_DEV=1`, test webhook secret, `KV_DEV_ADMIN` (dev-only admin bypass, never works in production builds).
- Push finished, tested work straight to `main` without asking (owner instruction 2026-11-12: "always push it, don't ask me") - still run tests first, and still ask before anything irreversible (deleting data, real payments/refunds, spending money). Only one agent session should change `main` at a time.
- The system only ever messages customers on Instagram; the owner sends WhatsApp himself (see `docs/instagram.md`).
- Customer-facing text exists in Arabic (Palestinian dialect, "إسا" not "هلأ"), Hebrew and English - change all three.
- When a durable owner decision is made, write it into the matching `docs/*.md` file (one line, dated), not into this file.

## Commands
`npm run dev` · `npm run store:export` · `npm test` · `npm run typecheck` · `npm run db:push` · `npm run staff:invite` · `npm run db:clean-tests` · `npm run chat -- --user x "msg"` / `npm run eval` (local bot - cost money, owner only)
