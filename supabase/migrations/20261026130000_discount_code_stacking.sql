-- Owner decision 2026-10-26: give the owner control over whether a discount
-- code can be combined with other codes on the same order. Default false
-- (exclusive) so every code created before this migration keeps behaving
-- exactly as it already does today - a code the owner never marks stackable
-- stays usable on its own only.
alter table public.discount_codes add column if not exists stackable boolean not null default false;
