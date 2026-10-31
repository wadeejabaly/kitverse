-- Owner report 2026-11-02: "like real madrid 25/26 you labeled some wrong i
-- just want to be able to fix them" - product names on the website come from
-- the hand-authored catalog/store-selection.json, not from products.title_en/
-- title_ar, so admin needs a way to flag "the owner corrected this one" and
-- have that correction win on export, the same way photo_status =
-- 'owner_upload' already wins over a committed photo. Default false so every
-- existing product keeps showing its current hand-authored name exactly as
-- it does today - nothing changes until the owner renames one.
alter table public.products add column if not exists title_override boolean not null default false;
