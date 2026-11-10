-- Owner request 2026-11-10: accessories (team keychains, and now scarves) are
-- really sold online. Until now checkout showed them in the cart but left them
-- out of the order. Each accessory an order carries is one row here; its price
-- comes from the price list's per-order add-ons ('keychain', 'scarf') through
-- the pricing engine, like the gift box - never from the browser.
-- Additive only: a new table, nothing existing changes.
create table if not exists public.order_accessories (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  handle text not null,                         -- src/data/accessories.json handle, e.g. 'scarf-real-madrid-navy'
  category text not null check (category in ('keychain', 'scarf')),
  title text not null,                          -- what to pick / ship, e.g. 'Real Madrid Scarf - Navy & White'
  qty int not null default 1 check (qty between 1 and 50),
  created_at timestamptz not null default now()
);
create index if not exists order_accessories_order on public.order_accessories (order_id);
alter table public.order_accessories enable row level security;
create policy staff_all on public.order_accessories for all to authenticated using (public.is_staff()) with check (public.is_staff());
