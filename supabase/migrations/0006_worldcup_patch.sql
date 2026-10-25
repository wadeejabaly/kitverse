-- KitVerse — World Cup patch for national-team shirts (migration 0006)
--
-- HOW TO APPLY
--   Option A (CLI):  supabase link --project-ref <ref> && supabase db push
--   Option B (UI):   Supabase dashboard → SQL Editor → paste this whole file → Run
--
-- APPLY 0001–0005 AND THIS FILE, IN THAT ORDER, BEFORE DEPLOYING THE CODE
-- THAT GOES WITH IT. The checkout routes can now write `order_items.patch =
-- 'worldcup'` on a national-team line, so a database still on 0005 fails
-- that checkout with a check-constraint violation.
--
-- WHAT CHANGES (owner decision 2026-10-25)
--   Migration 0005 gave `order_items.patch` a CLUB-only official-patch
--   add-on: 'league' or 'ucl'. This adds a THIRD value, 'worldcup', for a
--   national-team product's own patch — a club shirt and a national shirt
--   never share a value, enforced server-side by sanitizePatch()
--   (src/lib/product.ts): a club product can only ever be billed 'league'
--   or 'ucl', a national-team product only ever 'worldcup'.
--
-- The security model of 0001–0005 is unchanged: RLS on, zero policies,
-- service role only. This adds no policy.

alter table public.order_items
  drop constraint if exists order_items_patch_check;

alter table public.order_items
  add constraint order_items_patch_check
  check (patch is null or patch in ('league', 'ucl', 'worldcup'));
