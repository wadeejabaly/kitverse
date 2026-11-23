# Catalog photos, hiding and deleting products

(Moved from CLAUDE.md 2026-11-23, unchanged.)

## Photos
`product_images.sleeve` ('short'/'long', owner decision 2026-11-02, Part 8): the storefront gallery is
two separate sets, not one list - picking "Long sleeve" on a product page swaps the whole thumbnail
row to that shirt's long-sleeve photos (`ProductGallery.tsx`/`ProductSleeveContext.tsx`), so every
photo in product_images belongs to one set or the other. "Front of a sleeve group" = lowest `sort`
within that (product, sleeve) pair; admin's "All photos" (`src/app/admin/(app)/photos/photo-manager.tsx`)
shows and manages the two groups separately, and `primary_image_url`/`photo_status` only ever track the
short-sleeve group's front photo. `scripts/export-store-catalog.ts` builds `images`/`imagesLongSleeve`
from product_images grouped this way, falling back to the old JSON-only path (below) for any product
not yet migrated. The one-off migration (`scripts/migrate-real-photos.ts`, removed 2026-11-23 - it is in git history) was the migration
that brought the catalog's ~700 committed "real" photos into the database this way (owner report
2026-11-02: "there are photos in the website that dont appear in the admin" - those photos lived only
as files + catalog/store-selection.json's `images`/`imagesLongSleeve` fields, invisible to admin).

Customers only ever see photos that passed `src/lib/catalog/photo-qa.ts`:
- no added text, labels or watermarks;
- not kids or baby items for adult requests;
- front view and attractive;
- the crest has been confirmed as the right team. Supplier albums are sometimes mislabelled.

Catalogue photos are standardized (1200x1200, shirt centred on flat #F1F3F7, owner spec 2026-11-09): `scripts/images/standardize.py`, admin uploads via `catalog/image-overrides.json` + `public/products/std/`, see `docs/image-standardization.md`. Product tiles are flat #F1F3F7 with the photo filling the square, so new photos should go through the tool too.

Never send supplier images directly. Kids items are shown only when the customer asks for kids. Commands: `npm run photos:screen`, `npm run photos:verify-teams`.

**Committed-file galleries silently lose to a single admin upload (found + fixed 2026-11-03).** As soon as a product has ANY row in `product_images` (even just one owner upload of the main photo), `export-store-catalog.ts`'s `migrated` flag flips to true for that product and it stops reading `catalog/store-selection.json`'s `images`/`imagesLongSleeve` fields *at all* - a product can have a rich gallery committed as files + JSON and still show just the one admin-uploaded photo on the site, with no error anywhere. Found when the owner reported Bayern Munich showing only 1 photo; turned out 55 products across the catalog had this gap (owner had uploaded one photo each via admin at some point, orphaning the committed JSON galleries). Fixed by inserting the missing `images`/`imagesLongSleeve` paths directly as `product_images` rows (`source: 'real'`, relative `/products/...` urls - no Storage upload needed, same as how `image` already works for a non-migrated product) rather than editing the JSON, then redeploying. **Going forward: once a product has any `product_images` row, adding photos for it means inserting `product_images` rows (or using admin's own upload), never editing `catalog/store-selection.json`'s `images`/`imagesLongSleeve` - that JSON path only still works for a product with zero DB photo rows.** (The migrate script and its admin button were removed in the 2026-11-23 cleanup - they could insert duplicate primary rows.)

## Deleting / hiding products
Owner decision 2026-11-02: admin Photos -> "Manage shirts" (`src/app/admin/photos-actions.ts`:
`deleteProduct`/`bulkDeleteProducts`/`bulkSetProductsHidden`) lets the owner delete a shirt (`products`
row + its images/options/post-matches, blocked only when it has order history - `order_items.product_id`
has no cascade on purpose) or set its status to `hidden` (never returned by `search_catalog`, refused
in a draft order, dropped from a web checkout line - `src/lib/catalog/search.ts`/`orders/draft.ts`/
`orders/web.ts`), and both now work on a *website* ("featured") shirt too, not just bot-only ones.

That works without editing `catalog/store-selection.json` because `scripts/export-store-catalog.ts`
skips any selection entry whose row is gone or `hidden` when it builds `src/data/catalog.json` -
deleting/hiding a website shirt fires the deploy hook (same ~2 min as a photo upload) and it drops off
the site on the next build, even though the JSON file still lists its handle. That file stays the
record of WHICH shirts are hand-picked; the DB row now just controls whether a picked one is actually
live. Un-hiding (status back to `available`) brings it right back, same way.

Caveat: `scripts/apply-store-selection.ts` (used when Wadeea changes the hand-picked list) still
matches purely by handle - if it's ever re-run, it will recreate a *deleted* shirt as a new row from
its still-there `catalog/store-selection.json` entry (a *hidden* one isn't affected, re-running that
script doesn't touch `status`). If a deleted shirt should stay gone for good even through a future
re-sync, its entry needs removing from that file too - a code change, same as adding one.
