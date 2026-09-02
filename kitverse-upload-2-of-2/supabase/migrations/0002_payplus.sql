-- KitVerse — a second payment processor (migration 0002)
--
-- HOW TO APPLY
--   Option A (CLI):  supabase link --project-ref <ref> && supabase db push
--   Option B (UI):   Supabase dashboard → SQL Editor → paste this whole file → Run
--
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT GOES WITH IT. The application
-- selects the columns added here on every order read, so a deployment running
-- against a database still on 0001 fails every order lookup.
--
-- WHAT CHANGES
--   Cards issued in Israel are cleared by PayPlus; PayPal stays as the
--   international option. One order row is settled by exactly ONE of them,
--   and `payment_provider` records which — it is not decoration: the
--   pending→paid transition refuses to settle an order whose provider does
--   not match the webhook that arrived (src/lib/orders.ts), so a PayPal event
--   can never pay a PayPlus order and vice versa.
--
-- The security model of 0001 is unchanged: RLS on, zero policies, service
-- role only. Nothing below adds a policy.

-- Which processor owns this order. Existing rows are PayPal orders, and the
-- default keeps the PayPal path writing exactly the rows it wrote before.
alter table public.orders
  add column if not exists payment_provider text not null default 'paypal';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_payment_provider_check'
  ) then
    alter table public.orders
      add constraint orders_payment_provider_check
      check (payment_provider in ('paypal', 'payplus'));
  end if;
end
$$;

-- The PayPlus hosted payment page we sent the buyer to. UNIQUE for the same
-- reason paypal_order_id is unique: one payment attempt belongs to one order
-- row, enforced by the database rather than hoped for in application code.
alter table public.orders
  add column if not exists payplus_page_request_uid text;

-- The settled PayPlus transaction — the counterpart of paypal_capture_id.
-- Also unique: a transaction that has paid one order can never be recorded
-- against a second one, so a replayed callback cannot double-settle.
alter table public.orders
  add column if not exists payplus_transaction_uid text;

create unique index if not exists orders_payplus_page_request_uid_key
  on public.orders (payplus_page_request_uid)
  where payplus_page_request_uid is not null;

create unique index if not exists orders_payplus_transaction_uid_key
  on public.orders (payplus_transaction_uid)
  where payplus_transaction_uid is not null;

-- The customer-facing order reference.
--
-- The confirmation page has only the short code from `?ref=` and must be able
-- to answer one question — "is this order paid?" — without the URL carrying
-- anything else about the customer. PostgREST cannot filter on a cast, so the
-- reference is materialised as a column and indexed.
--
-- It mirrors orderReference() in src/lib/checkout.ts exactly: the first eight
-- hex characters of the uuid, uppercased. The function is declared IMMUTABLE
-- because it genuinely is — it reads nothing but its argument — which is what
-- lets a generated column use it.
create or replace function public.kitverse_order_reference(order_id uuid)
returns text
language sql
immutable
strict
as $$
  select upper(left(replace(order_id::text, '-', ''), 8))
$$;

alter table public.orders
  add column if not exists reference text
  generated always as (public.kitverse_order_reference(id)) stored;

-- Deliberately NOT unique. Eight hex characters collide once in ~4.3 billion,
-- and a unique index would turn that into a failed INSERT on the money path.
-- The lookup handles a collision by declining to answer (src/lib/order-service.ts),
-- which costs one customer a "we are confirming your payment" screen instead
-- of costing the store an order.
create index if not exists orders_reference_idx on public.orders (reference);
