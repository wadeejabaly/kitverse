-- Owner request 2026-11-16 (riddle winner coupon): a code can be allowed to combine ONLY with the
-- running dated sale code (e.g. BLACKFRIDAY15), not with any other code. Additive, default off.
alter table public.discount_codes add column if not exists combines_with_sale boolean not null default false;
