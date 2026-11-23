# catalog/

Source data for the shop's catalog. The live catalog is the database (`products`,
`product_options`, `product_images`); these files choose what the website shows, and feed
the image tools.

| File | What | Used by |
|---|---|---|
| `store-selection.json` | Wadeea's hand-picked website shirts (the website list) | `scripts/apply-store-selection.ts`, `scripts/export-store-catalog.ts` |
| `store-collections.json` | Leagues/teams shown as collections on the website | `scripts/export-store-catalog.ts` |
| `image-overrides.json` | Admin-uploaded photo URL -> standardized copy in `public/products/std/` | `scripts/export-store-catalog.ts` (see `docs/image-standardization.md`) |
| `showcase-sources/` | Source photos for the homepage 360° showcase frames | `scripts/images/showcase_frames.py` |


Statuses in the database: **featured** = on the website and the bot, **available** = the bot can
sell it on request, **hidden** = off everywhere.
