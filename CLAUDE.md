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
- GSAP + ScrollTrigger + Lenis for motion — **dynamically imported, desktop
  pointer only** (`src/components/motion/env.ts`). Never add Framer Motion.

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
  `₪95` with LTR digits. A `<select>`'s `<option>` cannot carry a `<bdi>`, so
  the checkout region options embed U+2066/U+2069 around the rate by hand.
- **Latin numerals always** — `2026`, `₪95`, never `٢٠٢٦`. Watch for
  `next-intl` number formatting silently producing Arabic-Indic digits: format
  the year as a string.
- Arabic punctuation in Arabic copy: `،` and `؟`.
- Alignment is start-based. Logical properties do **not** fix grid or flex
  visual order — eyeball every section in BOTH locales before calling it done.
- Arabic copy is a draft until a native speaker signs off. Flag it in the PR,
  not in shipped markup.

## Owner decisions (confirmed — do not re-litigate)

1. **Pricing (ILS, VAT-inclusive) — updated 2026-09-02.** Flat by product
   type: Fan 95 / Player 110, and **Retro 135** for any shirt whose season is
   2022 or earlier. Retro is derived from the product's `season`, **not** from
   `kind` — `kind` (national/current/previous) is a browsing category and no
   longer touches money. Retro is not a version the shopper picks: the PDP
   hides the Fan/Player fieldset on a retro product and stores `"fan"`, which
   `priceFor` ignores there anyway. Sizes 3XL +9, 4XL +12. Add-ons unchanged:
   name & number 39, badge patch 19. **There is no compare-at / sale pricing
   anywhere** — `compareAtFor()` and `<ComparePrice>` are gone, not disabled.
   `FUTURE_PRICES` in `pricing.ts` parks the owner's confirmed figures for
   product types that have no catalogue data yet (kids kit 200, adult kit 300,
   NBA 160, long-sleeve 105/120/145); nothing reads them.
2. **Locales.** `ar` default (RTL) at `/`, `en` at `/en`.
   `localePrefix: "as-needed"`, `localeDetection: false`.
3. **Shipping at launch — updated 2026-09-02.** Israel only, priced **by
   region**, not flat: north 50 / center 60 / negev 70 / jerusalem 100 (that
   last tier covers Jerusalem, the West Bank and Eilat). The shopper picks a
   region from a required select at checkout — it is never inferred from the
   free-text city — and the same closed set is revalidated server-side before
   anything is priced. The cart page shows no figure at all ("calculated by
   region at checkout"), because it has no region to price from.
   `orders.delivery_region` records the choice (migration `0003`), both
   payment-start routes write it, and it appears in the owner notification.
4. **Catalog gate.** A product renders only if its image review state is
   `approved`. Everything else is hidden from the storefront.
5. **Orders** live in Supabase (`orders` + `order_items` only). The catalog is
   build-time static JSON. Admin is the Supabase dashboard.
6. **No customer accounts, no auth.** The cart is client-side localStorage.
7. **Fan vs Player**: same design. Fan = relaxed cut, woven badge. Player =
   athletic slimmer cut, lighter fabric, heat-pressed badge.

## Design tokens

Light: ground `#F5F3EF`, tile `#FFFFFF`, ink `#14140F`, ink-soft `#6E6A5F`,
rule `#E3DFD6`, accent `#182448`, gold `#856618`, chip `#EEEBE4`. Dark scheme
swaps all of them (accent `#8FA5CE`, gold `#B08F55`) except `--tile`, which
stays white because it is the photo backdrop.

Radius is **0** everywhere. Max page width 1180px (`max-w-page`). The accent is
precious: prices and primary buttons only. `--rule` is the only separator.
All prices and figures get `.price` / `.tabular` (tabular-nums).

The accent and the gold are sampled from the club crest
(`public/brand/badge.png`) — shield navy and outer ring. The crest's electric
blue is **not** a token and appears nowhere in the UI; it lives inside the
badge artwork only.

`--gold` is a micro-accent with exactly **three** uses, and no fourth may be
added without a design decision: section/page eyebrows (a bare `.mono-eyebrow`;
utility eyebrows opt out with `text-ink-soft`), the nav hover underline, and
the footer's top hairline. It was four — the compare-at strikethrough rule
retired with compare-at pricing itself, and that slot was **not** reissued.
(`--flood-gold`, the Floodlight hero's eyebrow colour, is a separate token for
a separate dark surface, the way `--band-ink` relates to `--ink`. It is not a
use of `--gold`.)

Brand assets: `public/brand/badge.png` (transparent crest, used by
`<BrandBadge>` in the header, mobile overlay and footer), `public/brand/og.png`
(share card), and `src/app/icon.png` + `src/app/apple-icon.png`, which Next
picks up by file convention — do not add an `icons` block to metadata.

There is no wordmark in the navigation: the crest alone is the brand mark in
the header and the mobile overlay. The one surviving logotype is the footer's
`.ghost-wordmark` — decorative, `aria-hidden`, ~5% ink, and the Latin-logotype
exception still applies to it (tracked and uppercase in both locales).

`--band` / `--band-ink` are the navy surface, and they are NOT `--accent`.
`--accent` is a text-and-button colour, so dark mode *lifts* it to a pale blue
to stay legible on the ground; painting a whole panel with it turns that panel
into a light lavender slab in the middle of a dark page. The band is a
surface, so it darkens like every other surface. Gold is not used inside the
band: `--gold` measures 2.8:1 on the band navy, so secondary text on it is
`--band-ink` at low alpha (`.band-soft`) instead.

The band is a layered material, not a flat fill: a directional navy gradient
(`--band-hi` → `--band-lo`), baked-alpha grain, and a `band-ink` plate-frame
hairline (`.band::after`). At ≥900px a `.band-glass` layer adds frosted
translucency (`backdrop-filter` blur; worst-pixel contrast measured 8.4:1+
headline, 5.5:1+ `.band-soft`, both themes); below 900px and under
`prefers-reduced-transparency` it falls back to the opaque gradient (11.7:1+).
The blur lives on a positioned child span, never on `.band` itself —
`isolation: isolate` or a backdrop root on the plaque would blind the blur to
the wall behind it, and `backdrop-filter` on an ancestor of anything `fixed`
re-parents that fixed element (the header bug). RTL mirrors the gradient via
the inherited `--band-angle` property, not a `[dir]` restatement (specificity
would defeat the glass gate's `background-image: none`).

**The band is used exactly once**, and that is a rule rather than a
description: the hero plaque in `<HeroB/>`. The Fan/Player explainer used to
be a second, full-bleed band, and a page carrying both read as a pattern
instead of two emphases — so the explainer went back to the page ground. Do
not paint a second navy surface without retiring the first.

That "exactly once" now lives on `/hero-preview` rather than on the home page.
The home hero is `<HeroD/>` — **Floodlight** — and its stage
(`.kv-flood`, the `--flood-*` tokens) is a *different* dark surface from the
band, so promoting it retired the band from the storefront rather than joining
it. **Floodlight is the page's one navy moment**; `<HeroB/>` and its plaque
survive only as a reference variant on `/hero-preview`, which is the only
route where `.band` / `.band-glass` still render. The Fan/Player explainer
stays on the page ground for the same reason it did before — the rule is one
dark surface per scroll, and the Floodlight stage is now the one holding it.

Floodlight is also the single sanctioned exception to "the crest's electric
blue is not a token": `--flood-blue` / `--flood-blue-2` exist for that hero
and nothing outside the Floodlight system may reference them. The `--flood-*`
set is deliberately **not** mapped into `@theme` and does not vary with the
light/dark scheme — like `--tile`, the stage is always the stage. The block
carries no `backdrop-filter` and no `isolation`, because the hero sits under
the sticky translucent header and MobileMenu's `fixed` overlay and either
property would re-parent them (the same header bug documented below).

Because `--accent` and `--band` are the same navy in light mode, a `.btn`
inside the band disappears into it. The primary action on the band is
`.btn btn-band`, which inverts to a band-ink fill with band-coloured type
(15.2:1 light / 14.0:1 dark). It is the same one button treatment, not a
second one.

**Breakpoints must be declared in `rem`.** Tailwind orders breakpoint media
queries by value so the larger one wins a conflict, but it can only compare
like with like — a `px` breakpoint among `rem` defaults sorts ahead of all of
them, and `wide:` then silently loses to `sm:` at every width.

## Motion

`src/components/motion/`. House rules: transform/opacity only, ease-out or
`cubic-bezier(0.16, 1, 0.3, 1)`, entrances 400–800ms, hovers 200–300ms,
stagger 60–100ms. No bounce, no overshoot.

- **Everything is authored visible-by-default and enhanced when motion is
  allowed.** `<Reveal>` ships plain markup and adds the start state itself, so
  every failure path — reduced motion, no JS, a chunk that never loads, a
  crawler — lands on "the content is already there". Never park content
  offscreen behind a JS reveal.
- CSS entrances (`.line-mask`) animate **transform only** and never opacity,
  because the home headline is the LCP element and must paint on frame one.
- The reduced-motion block zeroes `animation-delay`/`transition-delay` as well
  as durations. A staggered entrance with `both` fill holds its FROM state
  through the delay, so killing only the duration still blanks a headline.
- GSAP/ScrollTrigger/Lenis load **only** behind `heavyMotionAllowed()`
  (motion allowed + `(hover:hover) and (pointer:fine)` + ≥900px). A phone
  never fetches those chunks — measured at 49KB and 3 requests lighter.
- With Lenis, ScrollTrigger uses `scrub: true`, never a number: a numeric
  scrub adds GSAP smoothing on top of Lenis's and the two fight into a float.

The header is the site's one translucent surface (`.header-glass`): a
navy-tinted veil at `--header-solid` / `--header-glass` with a backdrop blur.
Two rules it must keep:
- The blur lives on `.header-glass::before`, never on `<header>` itself.
  `backdrop-filter` (like `transform` and `filter`) makes an element the
  containing block for its `position: fixed` descendants, and MobileMenu's
  `fixed inset-0` overlay renders inside the header — filtering the header
  directly collapses that overlay to the header's own ~76px box.
- The header's utility row is `text-ink`, not `text-ink-soft`. Content of any
  lightness passes under a translucent header: measured against the real
  composite, ink-soft falls to 3.1:1 (light, dark shirt beneath) and 3.5:1
  (dark, white tile beneath), while ink holds ≥8.9:1. For the same reason the
  row's hover cannot dim — it takes the nav's gold hairline instead.

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

**Build complete through checkout; pre-launch gates open.**

Shipped: foundation (locale routing, tokens, legal layer, consent, preflight);
catalog data layer (`npm run import-catalog` from `vendor/`, 262 products, 207
visible) with the dev-only `/review` tool; the full storefront (home, shop +
collections, PDP with name&number/badge, search, cart, size guide, shipping,
about) in both locales; brand integration (crest badge, navy accent, gold
micro-accents, icons/OG); the design-elevation pass (frosted header, magazine
index, motion system in `src/components/motion/`); checkout with Supabase
orders + PayPal (Orders v2, verified webhook) and PayPlus (hosted page,
HMAC+API-verified webhook, provider-scoped orders).

The home hero is **`<HeroD/>` — Floodlight** (`src/components/hero/HeroD.tsx`
+ `FloodStage.tsx`): a stadium-at-night stage scoped to the section, with
three shirts crossfading behind the headline. `/hero-preview` carries all four
variants with D tagged live. The 2026-09-02 owner decisions — the flat
Fan 95 / Player 110 / Retro 135 ladder with compare-at removed, and regional
shipping (50/60/70/100) with a required region select at checkout — are
implemented end to end: PDP, cards, cart, checkout, `repriceCart`, and both
payment-start routes. Project path is `Client Sites/KitVerseWebsite`; the
`vendor/` source data moved with it and the import script resolves relative to
the repo root, so it runs unchanged from the new location. Repo: private
`wadeejabaly/kitverse` on GitHub;
pushes require `gh auth switch --user wadeejabaly` (terminal normally stays
on OmarHawari2).

**Payments posture (owner decision 2026-09-02): PayPal only for now.** The
PayPlus integration stays in the tree but dormant — no `PAYPLUS_*` env is set
anywhere, so the card option never renders. Do not set those vars or revive
the PayPlus signup without an owner go; when it comes, it's env vars +
migration `0002`, not a build task.

Open launch gates: 20 products pending image review in `/review` (35 rejected
stay hidden); Supabase project + migrations `0001`/`0002`/**`0003`** — `0003`
(`delivery_region`) must be applied **before** this code deploys, because both
payment-start routes now write that column and a database still on `0002`
fails every checkout with an unknown-column error; PayPal sandbox e2e then
owner-run `/code-review ultra` on the money path before any live charge;
registered business name/address/contact email missing from legal pages;
all Arabic copy needs native review; `NEXT_PUBLIC_SITE_URL` on Vercel must
be the public https origin (payment callbacks depend on it). Vercel deploys
are done manually by the owner into the wadee account.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
