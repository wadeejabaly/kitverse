-- Owner request 2026-11-15 ("the 15% should only be on the shirts, not the accessories, names and patches"):
-- what a code's percent/amount is taken off. 'order' = the items total as before; 'shirts' = only the
-- shirts' and full kits' own price (incl. the 3XL/4XL size price), never names, patches, gift boxes or
-- accessories. The minimum order is still measured on the whole items total. Additive only.
alter table discount_codes add column if not exists applies_to text not null default 'order';
do $$ begin
  alter table discount_codes add constraint discount_codes_applies_to_check check (applies_to in ('order','shirts'));
exception when duplicate_object then null; end $$;
