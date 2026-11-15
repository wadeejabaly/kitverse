-- Bundles keep their own prices (owner request 2026-11-15): a website line that was bought as part of a
-- complete bundle carries the bundle's slug, and requote() prices it from the price list's bundle groups /
-- add-on bundle_price. Null = an ordinary line. Additive only.
alter table order_items add column if not exists bundle text;
alter table order_accessories add column if not exists bundle text;
