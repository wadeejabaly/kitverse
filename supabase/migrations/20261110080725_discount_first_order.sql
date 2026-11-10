-- Owner request 2026-11-10: "30 shekels off your first order from 300 ILS".
-- A discount code can now be limited to a shopper's FIRST order: checkout
-- (src/lib/orders/web.ts) refuses it when the phone number already has an
-- order that got past draft and wasn't cancelled. Additive; every existing
-- code keeps working exactly as before (default false).
alter table public.discount_codes
  add column if not exists first_order_only boolean not null default false;

comment on column public.discount_codes.first_order_only is
  'Only for a customer (matched by phone) with no earlier non-draft, non-cancelled order.';
