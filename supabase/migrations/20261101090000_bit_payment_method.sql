-- Owner decision 2026-10-31 (Part 7): orders.payment_method only allowed
-- 'cod' and 'paypal' - widen it to also allow 'bit', the Israeli PSP rail
-- (cleared through PayPlus, src/lib/payments/payplus.ts). public.payments
-- already allows provider 'bit' (supabase/migrations/20260930120000_core_schema.sql)
-- - only orders.payment_method was left behind.
alter table public.orders drop constraint orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('cod', 'paypal', 'bit'));
