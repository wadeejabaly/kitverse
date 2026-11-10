# catalog/

Source data for the shop's catalog. The live catalog is the database (`products`,
`product_options`, `product_images`); these files seed it, choose what the website shows, and feed
the image tools.

| File | What | Used by |
|---|---|---|
| `store-selection.json` | Wadeea's hand-picked website shirts (the website list) | `scripts/apply-store-selection.ts`, `scripts/export-store-catalog.ts` |
| `store-collections.json` | Leagues/teams shown as collections on the website | `scripts/export-store-catalog.ts` |
| `image-overrides.json` | Admin-uploaded photo URL -> standardized copy in `public/products/std/` | `scripts/export-store-catalog.ts` (see `docs/image-standardization.md`) |
| `showcase-sources/` | Source photos for the homepage 360° showcase frames | `scripts/images/showcase_frames.py` |
| `products.json`, `teams.json` | The supplier catalog (10,745 shirts, 729 teams, crawled 2026-09-28/29) - the first-time database seed | `npm run db:seed` (`scripts/seed-catalog.ts`) |
| `stats.json`, `not-offered-summary.json` | Counts from that crawl, and the supplier albums left out (training, jackets, shorts, baby...) | reference |

Rebuild `products.json`/`teams.json` from a fresh crawl with `npm run catalog:build`
(`tools/catalog-build/`, reads the local crawl data in `tools/catalog-build/data/`). It also writes
`products.csv` and `featured.csv` for spreadsheet review; those are not committed.

Statuses in the database: **featured** = on the website and the bot, **available** = the bot can
sell it on request, **hidden** = off everywhere.
