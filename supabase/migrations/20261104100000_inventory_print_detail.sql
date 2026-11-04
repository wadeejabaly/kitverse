-- Owner request 2026-11-04 (follow-up): "im interested in logging it in detail with size name and
-- number and badges" - the original inventory_items (20261104090000) was one row per VARIANT (a
-- running count), which can't tell a blank shirt apart from one that already has "Messi 10" printed
-- and a Champions League badge on it. Owner's explicit choice when asked: track each physical shirt
-- individually rather than just bumping a count.
--
-- A "physical shirt" here is really a BATCH: variant + exact print_name/print_number/patches. Logging
-- the same exact thing twice (e.g. two blank mediums) still correctly adds up via upsertQty in
-- inventory-actions.ts - it's only a distinct row when what's printed/attached differs. print_name/
-- print_number are NOT NULL DEFAULT '' (not nullable) so two blanks always compare equal for the
-- unique index below; NULL would never equal NULL and defeat it.
--
-- The variant-only matching against order_items (see 20261104090000's comment) is UNCHANGED - a
-- blank order can still be satisfied by any shirt of the right size regardless of what's printed on
-- it, the owner just now sees exactly what that stock actually is before using it.
alter table public.inventory_items add column print_name text not null default '';
alter table public.inventory_items add column print_number text not null default '';
alter table public.inventory_items add column patches text[] not null default '{}';

alter table public.inventory_items drop constraint inventory_items_product_id_audience_version_sleeve_size_key;
alter table public.inventory_items add constraint inventory_items_batch_key
  unique (product_id, audience, version, sleeve, size, print_name, print_number, patches);
