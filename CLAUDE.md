# KitVerse — working agreement

An Arabic-first online store for soccer jerseys. Arabic (RTL) is the default
language at `/`; English is secondary at `/en`. Checkout is PayPal plus plain
cash on delivery, no deposit (PayPlus dormant — see decision 1b). The
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
   `priceFor` ignores there anyway. Sizes 3XL +9, 4XL +12. Add-ons dropped
   with the same decision: name & number **20** (was 39). The flat badge-patch
   add-on from this decision was itself superseded on 2026-10-23 — see 1c.
   **There is no compare-at / sale pricing
   anywhere** — `compareAtFor()` and `<ComparePrice>` are gone, not disabled.
   `FUTURE_PRICES` in `pricing.ts` parks the owner's confirmed figures for
   product types that have no catalogue data yet (kids kit 200, adult kit 300,
   NBA 160, long-sleeve 105/120/145); nothing reads them.
1b. **Cash on delivery, plain — updated 2026-10-23 (re-litigated; see below).**
   A second checkout method beside PayPal, available whenever Supabase is
   configured. The buyer pays the courier the full order total on arrival —
   **no deposit of any kind.** This replaces the 2026-09-02 Bit-deposit
   mechanic below, which the owner explicitly asked to re-open and remove.
   The order is written `payment_provider='cash'`, `status='pending'` — the
   same initial status a fresh card order gets — and the owner is emailed
   **immediately on creation** (unlike the card rails, which email on
   payment — the owner has to recognise that the money changes hands at the
   door, not in this system). This is safe without a distinct
   `awaiting_deposit` status because `decidePaidTransition()`
   (`src/lib/orders.ts`) rejects any settlement attempt on a non-settleable
   provider **before it ever looks at status** — `cash` is excluded from
   `SettleableProvider`, so no webhook can touch a cash order regardless of
   what status string it holds. The owner still updates a cash order to
   `paid` by hand in the Supabase dashboard once it's delivered and collected;
   nothing in the application does this automatically. There is no
   `BIT_PHONE_NUMBER` env var, no Bit integration, and no deposit math —
   `bitDepositFor()` and the `BIT_DEPOSIT_*` tables are deleted, not disabled.
   The original 2026-09-02 Bit-deposit decision (kept here for history; no
   longer implemented): a Bit deposit priced off the order total (under 150 →
   35, under 220 → 40, else 50), deducted from the cash collected and **not**
   refunded on a refused delivery, with the order sitting at
   `status='awaiting_deposit'`, `payment_provider='bit_cod'` until the owner
   flipped it by hand. Old rows written under that mechanic keep reading
   correctly — migration `0005` is additive — the application simply never
   writes `awaiting_deposit` / `bit_cod` / `deposit_ils` again.
1c. **Official patch add-on, replacing the flat badge patch — owner decision
   2026-10-23, UI updated 2026-10-24, World Cup patch added 2026-10-25.**
   A shopper picks **at most one** patch per shirt, from a set that depends
   on the product: a **club** product (one with a league) offers that
   club's own league's official patch or the Champions League patch — never
   both, and the Champions League option is offered on every club product
   regardless of whether that club plays in the real UCL (any league, any
   season); a **national-team** product (`kind === "national"`, no league)
   offers only the **World Cup patch**, added 2026-10-25 per owner request —
   national-team shirts previously had no patch option at all. The two sets
   never overlap: a club shirt can never carry the World Cup patch and a
   national shirt can never carry a league/UCL patch. All three choices cost
   the same flat **₪11.99** (`ADDONS.patch` in `pricing.ts`, the site's
   first fractional ILS price — see `round2()`). On the PDP this is a
   checkbox ("Add an official patch") that reveals the choice when checked
   — not a three-way radio group, per the owner's 2026-10-24 request — a
   `<select>` when the product offers more than one option (club), or just
   the single option's name as plain text when it offers exactly one
   (national — a one-item dropdown would be pointless UI); unchecking the
   box is the only way back to "none". `ProductForm`'s `patchOptions` array
   is the one place that decides which set a product gets, and
   `sanitizePatch()` in `src/lib/product.ts` is its server-side mirror, so
   the two can never drift apart silently — the client's choice is never
   trusted, only what the product's own category allows is ever billed
   (two dedicated tests in `orders.test.ts` cover both directions: a
   national product requesting league/UCL, and a club product requesting
   World Cup, both collapse to `"none"`). The Arabic copy uses **رقعة**
   ("patch"), not شعار ("emblem/crest"), per a 2026-10-24 terminology check
   against how Arabic jersey retailers actually name this:
   `patchLegend`/`patchToggle`/`patchLeague`/`patchUcl`/`patchWorldCup`/
   `patchHint`/`propPatch*` all read "رقعة".
   `CartItem.patch: "none" | "league" | "ucl" | "worldcup"` replaces the old
   `badge: boolean`; `order_items.patch` (text) replaces `order_items.badge`
   in migration `0005`, and its check constraint is widened to allow
   `'worldcup'` in migration `0006`.
1d. **Gift box add-on — owner decision 2026-10-23.** Checkout-only (not on
   the cart page), **₪34.99** per box (`GIFT_BOX_PRICE`), quantity-selectable
   up to `GIFT_BOX_MAX_QTY` — a box can hold more than one shirt, so this is
   not one-per-item. Stored as `orders.gift_box_qty` / `orders.gift_box_ils`
   (migration `0005`), applied once per order on top of subtotal and
   shipping, never on an empty cart.
1e. **Address split — owner decision 2026-10-23.** The single free-text
   `address` field is replaced at checkout by separate **Street** and
   **House/apartment number** fields (`street` / `houseNumber` in the
   checkout schema, `orders.street` / `orders.house_number` in migration
   `0005`). The legacy `orders.address` column is still written, concatenated
   from the two new fields, for anything that still reads it.
1f. **Delivery window is 8–17 working days, and the cash checkout button is
   always visible — owner decision 2026-10-24.** The old "12 to 25 days"
   figure is retired everywhere it appeared (home values, PDP shipping
   accordion, cart/checkout `deliveryNote`, the shipping page, the about
   page, and the thank-you page) and replaced with **"8 to 17 working
   days"**, so the site never quotes two different delivery windows. The
   figure is shown in the checkout order summary (`cart.deliveryNote`) and
   again in the cash payment note (`checkout.payCashNote`) — both ABOVE the
   "Send order" button — specifically so a buyer sees the timeframe before
   they commit, not only on the confirmation page afterward. The cash
   button (`checkout.payCod`, now "Send order" / "أرسل الطلب", was "Order
   with cash on delivery") and every other payment control are rendered from
   the start rather than hidden behind a "complete your details" message —
   each is simply `.btn:disabled` (the site's one grey/50%-opacity disabled
   treatment) until `CustomerSchema` parses the delivery form, then reads as
   fully active. The underlying gate is unchanged: the onClick handlers that
   actually place an order still only run once `parsed.success` is true, so
   this is a visibility change, not a validation change. The name & number
   checkbox on the PDP now shows its price inline — "Add a name and number
   +₪20" — the same `<Figure>+₪{amount}</Figure>` treatment the size
   surcharges already use.
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
  `NEXT_PUBLIC_PAYPAL_CLIENT_ID`. Cash on delivery (decision 1b) has no
  personal-data secret of its own any more — `src/lib/bit.ts` and
  `BIT_PHONE_NUMBER` are deleted, not disabled.

## Current status

**Build complete through checkout; pre-launch gates open.**

Shipped: foundation (locale routing, tokens, legal layer, consent, preflight);
catalog data layer (`npm run import-catalog` from `vendor/`, 262 products, 207
visible) with the dev-only `/review` tool; the full storefront (home, shop +
collections, PDP with name&number/official patch, search, cart, size guide,
shipping, about) in both locales; brand integration (crest badge — sized 2x
as of 2026-10-23 — navy accent, gold micro-accents, icons/OG); the
design-elevation pass (frosted header, magazine index, motion system in
`src/components/motion/`); checkout with Supabase orders + PayPal (Orders v2,
verified webhook), PayPlus (hosted page, HMAC+API-verified webhook,
provider-scoped orders) and plain cash on delivery, no deposit
(`/api/checkout/cash/start`, migration `0005`, settled by hand once
delivered). The 2026-10-23 owner decisions (1b–1e above) — plain cash on
delivery replacing the Bit-deposit rail, the official-patch radio choice at
₪11.99, the ₪34.99 quantity-selectable gift box, and the street/house-number
address split — are implemented end to end: PDP, cart, checkout, repriceCart,
the cash/create-order/payplus payment-start routes, and the owner
notification email.

The home hero is **`<HeroD/>` — Floodlight** (`src/components/hero/HeroD.tsx`
+ `FloodStage.tsx`): a stadium-at-night stage scoped to the section, with
three shirts crossfading behind the headline. `/hero-preview` carries all four
variants with D tagged live. The 2026-09-02 owner decisions — the flat
Fan 95 / Player 110 / Retro 135 ladder with compare-at removed, name & number
at 20, and regional shipping (50/60/70/100) with a required region select at
checkout — are implemented end to end, as are the 2026-10-23 decisions above.
Project path is `Client Sites/KitVerseWebsite`; the
`vendor/` source data moved with it and the import script resolves relative to
the repo root, so it runs unchanged from the new location. Repo: private
`wadeejabaly/kitverse` on GitHub;
pushes require `gh auth switch --user wadeejabaly` (terminal normally stays
on OmarHawari2).

**Payments posture (updated 2026-10-23): PayPal + plain cash-on-delivery
are the live paths; PayPlus stays dormant.** The PayPlus integration stays in
the tree but no `PAYPLUS_*` env is set anywhere, so the card option never
renders. Do not set those vars or revive the PayPlus signup without an owner
go; when it comes, it's env vars + migration `0002`, not a build task. Cash
on delivery is live in the code and gated only on Supabase being configured —
no separate client input is owed (the old Bit-deposit mechanic's
`BIT_PHONE_NUMBER` requirement no longer exists).

Open launch gates: 20 products pending image review in `/review` (35 rejected
stay hidden); Supabase project + migrations
`0001`/`0002`/`0003`/`0004`/`0005`/**`0006`** — `0003` (`delivery_region`),
`0004` (superseded columns, kept for old rows), `0005` (plain cash: the
`payment_provider` check gains `'cash'`; `street`, `house_number`,
`gift_box_qty`, `gift_box_ils` on `orders`; `patch` on `order_items`) and
**`0006`** (widens the `order_items.patch` check constraint to also allow
`'worldcup'`) must all be applied **before** this code deploys, because the
payment-start routes write those columns and values and a database still on
an earlier migration fails every checkout with an unknown-column or
check-constraint error;
PayPal sandbox e2e then owner-run `/code-review ultra` on
the money path before any live charge; **the owner must know that a cash
order is marked `paid` only by hand in the Supabase dashboard, once the
shirt and money have actually changed hands** — nothing else ever will;
registered business name/address/contact
email missing from legal pages; all Arabic copy needs native review;
`NEXT_PUBLIC_SITE_URL` on Vercel must be the public https origin (payment
callbacks depend on it). Vercel deploys are done manually by the owner into the
wadee account.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
