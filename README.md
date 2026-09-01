# KitVerse

An Arabic-first online store for soccer jerseys. Arabic (RTL) is the default
language and lives at `/`; English lives at `/en`. Checkout runs on PayPal.
The catalog is a small dropship set built into the site at build time — no
inventory tracking, no customer accounts.

## Stack

- **Next.js 16** (App Router) · React 19 · TypeScript strict
- **Tailwind CSS v4** — CSS-first `@theme`, design tokens in `src/app/globals.css`
- **next-intl** — `ar` (default, RTL) + `en`, `localePrefix: "as-needed"`,
  `localeDetection: false`
- **Supabase** — orders only (server-side, service role)
- **Resend** — order notification email

Routing note: the middleware file is `src/proxy.ts` exporting `proxy` —
Next 16 renamed `middleware.ts`.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in what you need
npm run dev                  # http://localhost:3000
```

The site builds and runs with no environment variables set. Without PayPal
credentials, checkout renders a "payments not configured" state instead of
failing.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Unit tests (vitest) |
| `npm run import-catalog` | Rebuilds `src/data/*.json` and `public/products/` from `vendor/` |
| `npm run preflight` | Project rule checks — see below |

## Source data

`vendor/` holds the supplier source material the catalog is built from. See
`vendor/README.md` for what each folder contains.

**Not all of it is in git.** `vendor/data/`, `vendor/scripts/` and
`vendor/payloads/` are tracked; the two image archives are not:

| Path | Tracked? | What it is |
| --- | --- | --- |
| `vendor/data/` | yes | Supplier catalogue, Arabic translations, album metadata |
| `vendor/payloads/` | yes | Size guide + policy drafts as supplier HTML |
| `vendor/scripts/` | yes | The crawl/processing scripts, kept for provenance |
| `vendor/images-source/` | **no — on disk only** | The 329 shipped product photos |
| `vendor/images-alt/` | **no — on disk only** | 491 alternate photos the review tool swaps from |

The image archives are `.gitignore`d because they are large binaries, which
means **a fresh clone does not have them**. Back both folders up before any
machine migration or reinstall — losing them means the photography has to be
re-derived from the supplier.

Two things depend on `vendor/` existing:

- `npm run import-catalog` reads `vendor/data/` and copies from
  `vendor/images-source/` into `public/products/`.
- The dev-only image review tool (`/review`) reads `vendor/data/albums.json`
  to find a product's alternate photos and streams them from
  `vendor/images-alt/`.

Neither is needed to run or build the site: `src/data/*.json` and
`public/products/` are committed, so `npm run dev` and `npm run build` work
from a clean clone with no `vendor/` at all.

## Preflight

`npm run preflight` fails the build on:

- leftover placeholder markers in `src/`
- hardcoded absolute domains outside `src/lib/site.ts` (`getSiteUrl()` is the
  one place an absolute URL is assembled)
- physical-direction Tailwind classes (`ml-`, `mr-`, `pl-`, `pr-`,
  `text-left`, `text-right`) — logical properties only, because the default
  locale is RTL
- a missing `/privacy` or `/terms` route
- `PAYPAL_ENV` not declared in `.env.example`

## Conventions

- **Logical properties only.** `ms-/me-/ps-/pe-/text-start/text-end/start-/end-`.
- **All user-facing copy lives in `src/i18n/messages/{ar,en}.json`** — never
  inline in a component.
- **Prices come from `src/data/pricing.ts` only.** The server recomputes every
  total; a price sent by the client is never trusted.
- Zod validates the input of every API route.
- See `CLAUDE.md` for the full working agreement, including the Arabic
  rendering rules.
