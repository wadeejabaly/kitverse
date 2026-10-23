-- KitVerse — plain cash on delivery, gift box, split address, official
-- patches (migration 0005)
--
-- HOW TO APPLY
--   Option A (CLI):  supabase link --project-ref <ref> && supabase db push
--   Option B (UI):   Supabase dashboard → SQL Editor → paste this whole file → Run
--
-- APPLY 0001–0004 AND THIS FILE, IN THAT ORDER, BEFORE DEPLOYING THE CODE
-- THAT GOES WITH IT. The checkout routes write `payment_provider = 'cash'`,
-- `street`, `house_number`, `gift_box_qty` and `gift_box_ils` on every order
-- they create, and `order_items.patch` on every line, so a deployment
-- running against a database still on 0004 fails every checkout with a
-- check-constraint violation or an unknown-column error.
--
-- WHAT CHANGES (owner decisions 2026-10-23)
--   1. Cash on delivery is now PLAIN: no Bit deposit at all. The buyer pays
--      the courier in full on arrival. This replaces the 0004 Bit-deposit
--      rail (`payment_provider = 'bit_cod'`, `status = 'awaiting_deposit'`,
--      `deposit_ils`), which is retired but NOT dropped — old rows keep
--      reading correctly, the application simply never writes those values
--      again. The new rail writes `payment_provider = 'cash'` and
--      `status = 'pending'`, the SAME status a card order starts in — safe
--      only because `decidePaidTransition` (src/lib/orders.ts) rejects any
--      settlement attempt on a non-settleable provider regardless of status,
--      so no webhook can ever touch a `cash` order either way.
--   2. A gift-box add-on: `gift_box_qty` (how many boxes, 0 = none) and
--      `gift_box_ils` (what they cost) on every order, checkout-only.
--   3. The single free-text `address` column is replaced, going forward, by
--      `street` + `house_number`. `address` stays in the schema — the
--      application still writes it, concatenated from the two new columns,
--      for anything that still reads the old one — but street/house_number
--      are what the application reads from here on.
--   4. `order_items.badge` (boolean) is replaced by `order_items.patch`
--      (text: 'league' | 'ucl' | null) — the official-patch add-on. `badge`
--      stays in the schema for old rows but is no longer written.
--
-- The security model of 0001–0004 is unchanged: RLS on, zero policies,
-- service role only. Nothing below adds a policy.

-- --- the rail -----------------------------------------------------------
-- `payment_provider` gains 'cash'. 'bit_cod' stays allowed for existing rows
-- — the constraint has to be replaced rather than added to, which is safe
-- because every existing row already holds one of the values already listed.
alter table public.orders
  drop constraint if exists orders_payment_provider_check;

alter table public.orders
  add constraint orders_payment_provider_check
  check (payment_provider in ('paypal', 'payplus', 'bit_cod', 'cash'));

-- --- the address split ---------------------------------------------------
alter table public.orders
  add column if not exists street text;

alter table public.orders
  add column if not exists house_number text;

-- --- the gift box ---------------------------------------------------------
alter table public.orders
  add column if not exists gift_box_qty int not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_gift_box_qty_check'
  ) then
    alter table public.orders
      add constraint orders_gift_box_qty_check
      check (gift_box_qty >= 0);
  end if;
end
$$;

alter table public.orders
  add column if not exists gift_box_ils numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_gift_box_ils_check'
  ) then
    alter table public.orders
      add constraint orders_gift_box_ils_check
      check (gift_box_ils is null or gift_box_ils >= 0);
  end if;
end
$$;

-- --- the official patch ---------------------------------------------------
-- Replaces the old `badge` boolean. NULL means no patch — same meaning as
-- `badge = false`, but as the absence of a value rather than a false one,
-- matching how the rest of this schema represents "not applicable".
alter table public.order_items
  add column if not exists patch text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_items_patch_check'
  ) then
    alter table public.order_items
      add constraint order_items_patch_check
      check (patch is null or patch in ('league', 'ucl'));
  end if;
end
$$;
