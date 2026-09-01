# KitVerse — working agreement

An Arabic-first online store for soccer jerseys. Arabic (RTL) is the default
language at `/`; English is secondary at `/en`. Checkout is PayPal only. The
catalog is a small dropship set (~329 products) built into the site as static
JSON — no inventory tracking, no customer accounts, no custom admin (orders are
read in the Supabase dashboard). The aesthetic is quiet retail: fast, plain,
photo-forward.

## Stack (locked — do not substitute)

- Next.js 16 App Router · React 19 · TypeScript strict (**no `any`**)
- Tailwind v4, CSS-first `@theme` — tokens in `src/app/globals.css`
- next-intl · Supabase (orders only) · Resend (order mail) · PayPal (checkout)

## Conventions

- **Logical properties ONLY**: `ms-/me-/ps-/pe-/text-start/text-end/start-/end-`.
  Never `ml-/mr-/pl-/pr-/text-left/text-right/left-/right-`. Preflight fails the
  build on violations — the default locale is RTL, so this is not cosmetic.
- **All user-facing copy lives in `src/i18n/messages/{ar,en}.json`.** Never
  inline a string in a component. Every key must exist in both files.
- **Money has one source: `src/data/pricing.ts` → `priceFor()`.** The UI
  displays it; the server recomputes it. A price sent by the client is never
  trusted, and prices are never stored in the cart.
- **Zod validates the input of every API route.** No exceptions.
- Components consume design tokens, never hex literals.
- `next/image` for every product image.
- Quality bar: Lighthouse mobile ≥ 90, LCP < 2.5s.

### Next 16 gotchas

- `params`, `cookies()` and `headers()` are **async** — always await them.
- Middleware is `src/proxy.ts` exporting `proxy`. A file named `middleware.ts`
  is silently ignored.
- `useSearchParams` needs a `<Suspense>` boundary or the build fails.
- Phantom module errors after deleting files: `rm -rf .next` first.

## Arabic rendering rules (non-negotiable)

- `dir="rtl"` + `lang="ar"` on Arabic pages; scope `dir` per block on mixed
  content. Phone inputs are always `dir="ltr"`.
- **Never letter-space and never uppercase Arabic.** Tracking breaks the joined
  script and Arabic has no case. The mono eyebrow treatment
  (`.mono-eyebrow`) is Latin-only; in Arabic it falls back to the Arabic stack
  at normal tracking. Same for the negative heading tracking.
- Arabic body line-height is **1.85** (Latin is 1.6). Handled in `globals.css`.
- **Wrap numerals, prices, dates, URLs and Latin terms in bidi isolation**
  inside RTL text — `<bdi>` or an inline `dir="ltr"` span. Prices render as
  `₪169` with LTR digits.
- **Latin numerals always** — `2026`, `₪169`, never `٢٠٢٦`. Watch for
  `next-intl` number formatting silently producing Arabic-Indic digits: format
  the year as a string.
- Arabic punctuation in Arabic copy: `،` and `؟`.
- Alignment is start-based. Logical properties do **not** fix grid or flex
  visual order — eyeball every section in BOTH locales before calling it done.
- Arabic copy is a draft until a native speaker signs off. Flag it in the PR,
  not in shipped markup.

## Owner decisions (confirmed — do not re-litigate)

1. **Pricing (ILS, VAT-inclusive).** Current-season and national: Fan 169 /
   Player 219. Previous-season: Fan 129 / Player 169, with compare-at 169/219.
   Sizes 3XL and 4XL add +15. Add-ons: name & number 39, badge patch 19.
2. **Locales.** `ar` default (RTL) at `/`, `en` at `/en`.
   `localePrefix: "as-needed"`, `localeDetection: false`.
3. **Shipping at launch.** Israel only, one flat domestic rate.
4. **Catalog gate.** A product renders only if its image review state is
   `approved`. Everything else is hidden from the storefront.
5. **Orders** live in Supabase (`orders` + `order_items` only). The catalog is
   build-time static JSON. Admin is the Supabase dashboard.
6. **No customer accounts, no auth.** The cart is client-side localStorage.
7. **Fan vs Player**: same design. Fan = relaxed cut, woven badge. Player =
   athletic slimmer cut, lighter fabric, heat-pressed badge.

## Design tokens

Light: ground `#F5F3EF`, tile `#FFFFFF`, ink `#14140F`, ink-soft `#6E6A5F`,
rule `#E3DFD6`, accent `#1E4620`, chip `#EEEBE4`. Dark scheme swaps all of them
except `--tile`, which stays white because it is the photo backdrop.

Radius is **0** everywhere. Max page width 1180px (`max-w-page`). The accent is
precious: prices and primary buttons only. `--rule` is the only separator.
All prices and figures get `.price` / `.tabular` (tabular-nums).

## Project rules

- **No agency branding or third-party attribution anywhere in this project** —
  not in code, comments, docs, package metadata, the lockfile, or commit
  messages. This is a standalone product.
- `npm run preflight` must pass before any commit. It checks placeholder
  markers, hardcoded domains, physical-direction classes, the legal routes, and
  that `PAYPAL_ENV` is declared.
- Absolute URLs are assembled in exactly one place: `getSiteUrl()` in
  `src/lib/site.ts`.
- Secrets are server-only. The one PayPal value the browser may see is
  `NEXT_PUBLIC_PAYPAL_CLIENT_ID`.

## Current status

**Wave 1 complete** — foundation only.

Shipped: project setup, `ar`/`en` locale routing with RTL, design tokens and
type stacks, site chrome copy in both locales, the legal pages (privacy,
terms), the consent layer, the footer, a placeholder home page, and preflight.

Not built yet: the catalog import and `src/data/*` (types, pricing, catalog
accessors), the storefront pages (shop, PDP, search, cart), checkout and the
PayPal integration, the Supabase migration, and the image review tool.

Open items for later waves: the flat domestic shipping rate is a placeholder
pending owner confirmation; the registered business name, address and contact
email still need to be added to the legal pages before launch; and all Arabic
copy needs native review.
