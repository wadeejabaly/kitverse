-- KitVerse — orders schema (migration 0001)
--
-- HOW TO APPLY
--   Option A (CLI):  supabase link --project-ref <ref> && supabase db push
--   Option B (UI):   Supabase dashboard → SQL Editor → paste this whole file → Run
--
-- Two tables and nothing else: this store has no customer accounts, no auth
-- and no inventory. Catalog lives in build-time JSON; only orders are dynamic.
--
-- SECURITY MODEL — read before changing anything below.
--   Row Level Security is ENABLED on both tables and there are ZERO policies.
--   With RLS on and no policy, the `anon` and `authenticated` roles can see
--   and write nothing at all — a leaked publishable key buys an attacker an
--   empty result set. Every read and write in this application goes through
--   the service-role key from a server route (src/lib/supabase.ts), and the
--   service role bypasses RLS by design. Adding a policy here would open the
--   orders table to the browser; do not add one.

create extension if not exists "pgcrypto";

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled')),
  -- One PayPal order per row. The unique constraint is a money invariant:
  -- it makes a double-create for the same PayPal order impossible at the
  -- database level, not merely unlikely in application code.
  paypal_order_id text unique,
  paypal_capture_id text,
  customer_name text,
  email text,
  phone text,
  address text,
  city text,
  country text default 'IL',
  notes text,
  locale text,
  -- Server-computed figures only. Nothing a browser sent is ever stored here.
  subtotal_ils numeric,
  shipping_ils numeric,
  total_ils numeric
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  handle text,
  -- Snapshots: the catalog is rebuilt on every deploy, so a title or a price
  -- can change after an order is placed. What was bought is frozen here.
  title_snapshot text,
  size text,
  version text,
  name_number text,
  badge boolean,
  unit_price_ils numeric,
  qty int
);

-- The webhook and the capture route both look an order up by its PayPal id;
-- the confirmation query fetches an order's lines.
create index if not exists orders_paypal_order_id_idx
  on public.orders (paypal_order_id);
create index if not exists order_items_order_id_idx
  on public.order_items (order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Deliberately no policies. See the security note at the top of this file.
