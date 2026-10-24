-- Website checkout (storefront) orders land in the same orders table as Instagram orders.
alter table public.orders
  add column if not exists source text not null default 'instagram' check (source in ('instagram', 'website')),
  add column if not exists gift_boxes int not null default 0 check (gift_boxes between 0 and 10);

create index if not exists orders_source_idx on public.orders (source, created_at desc);
