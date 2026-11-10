-- Owner requests 2026-11-10: two "pay by hand, owner verifies" methods.
--   * bit_personal - a transfer to the owner's PERSONAL Bit account (no Bit
--     business API, no PSP).
--   * paypal_me    - a payment through the owner's personal PayPal.Me link.
-- Neither one tells the website that money arrived, so the order is NEVER
-- marked paid automatically: the customer may report "I paid" (a reference
-- and/or a screenshot), the order waits in 'awaiting_payment_verification',
-- and only the owner's Confirm in admin settles it
-- (src/lib/orders/manual-pay.ts). Additive only: every existing value stays
-- allowed and the PayPlus 'bit' / PayPal API 'paypal' rails are untouched.

alter table public.orders drop constraint orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('cod', 'paypal', 'bit', 'bit_personal', 'paypal_me'));

alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('draft','quoted','awaiting_details','awaiting_confirmation','awaiting_payment_verification',
    'confirmed','paid','in_supplier_batch','produced','at_warehouse','with_courier','delivered','cancelled','issue'));

alter table public.payments drop constraint payments_provider_check;
alter table public.payments add constraint payments_provider_check
  check (provider in ('paypal', 'cash', 'bit', 'bit_personal', 'paypal_me'));

alter table public.payments drop constraint payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded'));

-- What the customer reported, and what the owner found.
alter table public.payments
  add column if not exists customer_reference text,
  add column if not exists proof_path text,
  add column if not exists reported_at timestamptz,
  add column if not exists received_amount int check (received_amount is null or received_amount >= 0),
  add column if not exists verified_by uuid,
  add column if not exists review_note text;

-- One checkout attempt = one order: the browser sends the same attempt id on a
-- double click / retry, and the second insert collides here instead of
-- writing a second order (src/lib/orders/manual-pay.ts).
create unique index if not exists payments_manual_attempt
  on public.payments (provider, provider_order_id)
  where provider in ('bit_personal', 'paypal_me') and provider_order_id is not null;

-- Payment screenshots: private (owner-only, read through short-lived signed
-- URLs in admin), images only, 5 MB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;
