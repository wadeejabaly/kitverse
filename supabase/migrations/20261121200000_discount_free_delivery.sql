-- Owner request 2026-11-21 (KV25: 25% off shirts + free delivery): a code can also make delivery free.
-- Additive, default off.
alter table public.discount_codes add column if not exists free_delivery boolean not null default false;
