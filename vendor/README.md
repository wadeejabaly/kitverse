# vendor/

On-disk supplier source data, vendored from the (now retired) pipeline folders that used to
live alongside this project on the Desktop. It is not repo content — see `.gitignore` — and
exists only so the catalog importer and the dev-only image review tool are self-contained.

- `data/` — supplier catalogue (`catalogue.tsv`), Arabic translations, album metadata
  (`albums.json`), subcategory list, the old launch-12 handle list, and the pre-verified
  "FIXED images" CSV. Read by `scripts/import-catalog.mjs`.
- `payloads/` — the size guide and the three policy drafts (refund, shipping, terms) as
  supplier-authored HTML, source material for the storefront's policy copy.
- `images-source/` — the 329 shipped product photos (2048x2048, white backdrop), one per
  catalogue hash. Copied into `public/products/` by the importer.
- `images-alt/` — whitened alternate/candidate photos (more hashes than are currently
  shipped). This is the swap source the review tool (`/review`, `src/app/api/review/route.ts`)
  reads from when an approver picks a different photo for a product.
- `scripts/` — the crawl and image-processing scripts (`crawl.sh`, `match.py`, `parse.py`,
  `process.sh`, and the `bin/lift` helper binary + source) that originally produced the data
  above, kept for provenance and in case the catalogue ever needs to be re-derived.
