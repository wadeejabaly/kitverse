-- KitVerse — cash on delivery by Bit deposit (migration 0004)
--
-- HOW TO APPLY
--   Option A (CLI):  supabase link --project-ref <ref> && supabase db push
--   Option B (UI):   Supabase dashboard → SQL Editor → paste this whole file → Run
--
-- APPLY 0001, 0002, 0003 AND THIS FILE, IN THAT ORDER, BEFORE DEPLOYING THE
-- CODE THAT GOES WITH IT. The COD checkout route writes `payment_provider =
-- 'bit_cod'`, `status = 'awaiting_deposit'` and `deposit_ils` on every order it
-- creates, and the application selects `deposit_ils` on every order read, so a
-- deployment running against a database still on 0003 fails every COD checkout
-- with a check-constraint violation and every order lookup with an unknown
-- column.
--
-- WHAT CHANGES
--   A third payment rail, and the only manual one. PayPal and PayPlus settle
--   themselves over a callback this application verifies; Bit does not. There
--   is no Bit API here at all:
--
--     1. the buyer picks cash on delivery at checkout and is told the deposit;
--     2. this application writes the order as `awaiting_deposit` and emails the
--        owner IMMEDIATELY — unlike the card rails, which email on payment,
--        because the owner has to be able to recognise the incoming transfer;
--     3. the buyer sends the deposit by Bit to the owner's own number
--        (env BIT_PHONE_NUMBER), quoting the order reference;
--     4. THE OWNER SETS status = 'paid' BY HAND IN THIS DASHBOARD once the
--        money is in their Bit account. Nothing in the application can do it:
--        `bit_cod` is excluded from SettleableProvider in src/lib/orders.ts,
--        and decidePaidTransition rejects any callback aimed at such an order
--        ("manual-provider"), so a forged or misrouted PayPal/PayPlus event
--        can never close a COD order that was never paid for.
--
--   The deposit is deducted from the cash the courier collects, and is not
--   refunded if the buyer refuses the delivery. Deposit tiers live in
--   src/data/pricing.ts (bitDepositFor: <150 → 35, <220 → 40, else 50) and are
--   computed from the total THIS SERVER repriced, never from a browser figure.
--
-- ABANDONED ORDERS need no cleanup path and get none. An `awaiting_deposit`
-- order whose deposit never arrives is simply never shipped and never becomes
-- paid; it sits in the dashboard as a record of an attempt, exactly like a
-- `failed` card order does. There is no expiry job and no cancellation flow to
-- write — adding one would only risk cancelling an order whose transfer was in
-- flight.
--
-- The security model of 0001/0002/0003 is unchanged: RLS on, zero policies,
-- service role only. Nothing below adds a policy.

-- --- the rail -----------------------------------------------------------
-- `payment_provider` gains 'bit_cod'. The constraint has to be replaced
-- rather than added to; dropping and recreating it is safe because every
-- existing row already holds 'paypal' or 'payplus'.
alter table public.orders
  drop constraint if exists orders_payment_provider_check;

alter table public.orders
  add constraint orders_payment_provider_check
  check (payment_provider in ('paypal', 'payplus', 'bit_cod'));

-- --- the status ---------------------------------------------------------
-- 'awaiting_deposit' means: the order is placed and reserved, and it is
-- waiting for money that arrives outside this system. It is deliberately NOT
-- 'pending': every settlement UPDATE in the application is guarded by
-- `where status = 'pending'`, so a COD order is out of reach of all of them by
-- construction, not by a check someone has to remember to write.
alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'awaiting_deposit', 'paid', 'failed', 'cancelled'));

-- --- the deposit --------------------------------------------------------
-- Server-computed, like every other figure on this row. NULL on card orders,
-- and nullable rather than defaulted so "no deposit" and "a deposit of zero"
-- can never be confused.
alter table public.orders
  add column if not exists deposit_ils numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_deposit_ils_check'
  ) then
    alter table public.orders
      add constraint orders_deposit_ils_check
      check (deposit_ils is null or deposit_ils > 0);
  end if;
end
$$;

-- The owner's working queue: which COD orders are still waiting for a
-- transfer. Partial, because it is the only question ever asked of it.
create index if not exists orders_awaiting_deposit_idx
  on public.orders (created_at)
  where status = 'awaiting_deposit';
