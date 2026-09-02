-- KitVerse — regional delivery (migration 0003)
--
-- HOW TO APPLY
--   Option A (CLI):  supabase link --project-ref <ref> && supabase db push
--   Option B (UI):   Supabase dashboard → SQL Editor → paste this whole file → Run
--
-- APPLY THIS BEFORE DEPLOYING THE CODE THAT GOES WITH IT. Both checkout
-- routes (create-order, payplus/start) write `delivery_region` on every new
-- order as of this change, so a deployment running against a database still
-- on 0002 fails every checkout attempt with an unknown-column error.
--
-- WHAT CHANGES
--   Shipping is no longer one flat rate — it is priced per region
--   (src/data/pricing.ts: north 50 / center 60 / negev 70 / jerusalem 100,
--   the last covering Jerusalem, the West Bank and Eilat). The shopper picks
--   their region explicitly at checkout; this column records which one, so
--   the owner packing an order knows where it is actually going and the
--   figure charged can be reconciled against it.
--
-- The security model of 0001/0002 is unchanged: RLS on, zero policies,
-- service role only. Nothing below adds a policy.

alter table public.orders
  add column if not exists delivery_region text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_delivery_region_check'
  ) then
    alter table public.orders
      add constraint orders_delivery_region_check
      check (delivery_region is null or delivery_region in ('north', 'center', 'negev', 'jerusalem'));
  end if;
end
$$;

-- NULL is allowed (not NOT NULL) so existing pre-migration rows, which have
-- no region on file, remain valid rows rather than failing the migration.
-- Every order written by the application from this point on always sets it —
-- CustomerSchema in src/lib/checkout.ts requires `region` on every request.
