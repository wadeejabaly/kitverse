# Product photo standardization (2026-11-09)

Owner spec "Complete product image standardization": every catalogue photo becomes a 1200x1200
square on a flat #F1F3F7 background, the shirt centred at 80% of the height (width capped at 86%),
with one identical soft shadow. The shirt itself is never redrawn: only background removal,
resampling and (when a small source is upscaled) a mild unsharp mask.

Tool: `scripts/images/standardize.py` (rembg ISNet matte + a colour flood from the photo border,
unioned so white collars/crests/stripes on white backgrounds are not erased; hole-filled; edges
de-fringed against the old background). It never overwrites: it writes to `--out` and a JSON report.
Statuses: `ok`, `review` (written, with flags), `manual` (the shirt edge is not reliably visible:
nothing written, original stays), `kept` (close-up or shirt cut off by the frame: original stays;
`--allow-edge` processes one anyway after checking it by eye).

How the results are wired in:
- Photos committed under `public/products/` were replaced in place (same URL, same
  `product_images` rows). Originals: git history (and a copy in the owner's
  `Desktop/kitverse-photo-originals-2026-11-09`).
- Photos the owner uploaded through admin live in Supabase Storage. Their standardized copies are
  committed under `public/products/std/<handle>/<file>` and `catalog/image-overrides.json` maps the
  storage URL to that copy. `scripts/export-store-catalog.ts` swaps them in at build time, only if
  the file exists in the checkout. Database rows and the original uploads are untouched (they are
  the backup, and admin keeps showing them). A photo uploaded later is a new URL, so it shows as
  uploaded until it is run through the tool and added to the map.
- Card, gallery, cart and checkout tiles are flat #F1F3F7 with the photo filling the square
  (no multiply blend), so a standardized photo is seamless.

First pass (612 photos inspected: 503 committed, 91 admin uploads, 18 new retro photos):
307 standardized and live, 155 of them upscaled from a small source; 22 need manual work
(white shirt on a near-white background, no visible edge); 49 close-ups kept as they are;
234 left as the original because the automatic shape check could not confirm a whole shirt
(crest/label close-ups, folded or tilted shots, damaged mattes) - conservative on purpose.

2026-11-10: the nine card fronts the automatic matte could not separate (inter-milan away,
liverpool away, tottenham home, valencia home, west-ham away, chelsea third - white on white;
torino away, turkey home, psg away) were cut out with Photoroom background removal (the owner's
Photoroom connector; a cut-out only, no generative edit) and laid out with
`standardize.py`, which now accepts a ready-made transparent cut-out as input.

Card fronts still on the original photo: iraq third, newcastle home/away/third, psg third (model
shots - a person wearing the shirt; background removal keeps the person, and Photoroom's ghost
mannequin needs a paid tier - psg third also carries a "X/..." watermark, which breaks the photo
rules). Athletic Bilbao away/third and Fiorentina third have no photo.
