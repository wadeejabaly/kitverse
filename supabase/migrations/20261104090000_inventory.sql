-- Owner request 2026-11-04: "sometimes i get orders cancelled so i need you to make inventory so i can
-- put in these items, and once an order comes in i need a way to tell if i have the items in or i need
-- to order them from the supplier". Per CLAUDE.md the business holds NO inventory today - every order
-- is placed on sale with the supplier - this is the owner choosing to start keeping some stock on hand
-- (mostly shirts freed up by a cancellation) as a deliberate exception.
--
-- Matched against order_items by (product_id, audience, version, sleeve, size) only - deliberately NOT
-- by print_name/print_number. Whether a shirt sitting here is blank or already printed is a production
-- detail the owner handles himself when he pulls it to fulfil an order, not something this table tracks;
-- trying to match on name/number would mean a printed "Messi 10" shirt could never satisfy an order for
-- a blank one of the same size, which is wrong for how the owner actually works.
--
-- One row per variant (unique below), qty accumulated by upserting - a simple on-hand count, not a full
-- movement ledger: `note` is freeform and gets overwritten by whoever last touched the row, same as the
-- rest of this admin's "latest state, not full history" tables (e.g. products.primary_image_url).
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  audience text not null default 'adult' check (audience in ('adult', 'women', 'kids')),
  version text not null default 'player' check (version in ('fan', 'player')),
  sleeve text not null default 'short' check (sleeve in ('short', 'long')),
  size text not null,
  qty int not null default 0 check (qty >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, audience, version, sleeve, size)
);
create index inventory_items_product on public.inventory_items (product_id);

create trigger inventory_items_updated_at before update on public.inventory_items
  for each row execute function public.set_updated_at();

alter table public.inventory_items enable row level security;
create policy staff_all on public.inventory_items for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Owner decision 2026-11-04: cancelling an order should ASK before touching inventory ("not every
-- cancelled order might be inventory" - e.g. one that was never confirmed/produced has nothing physical
-- to return). This column is the "have I been asked about this one yet" flag the order page checks to
-- show (or stop showing) that prompt - set whether the owner adds items or explicitly skips, so a
-- cancelled order only ever prompts once.
alter table public.orders add column returned_to_inventory_at timestamptz;
