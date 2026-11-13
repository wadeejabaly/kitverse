-- Shipment tracking (owner request 2026-11-13): the supplier ships a batch with Junhe; the owner
-- types the tracking number on the batch and the orders in it move on by themselves:
-- shipped -> produced ("on the way"), Junhe delivered to the owner -> with_courier (24-72h to the
-- customer), 3 days after that -> delivered. Additive only.
alter table public.supplier_batches
  add column if not exists tracking_number text,
  add column if not exists tracking_registered boolean not null default false,
  add column if not exists tracking_status text,
  add column if not exists tracking_events jsonb not null default '[]'::jsonb,
  add column if not exists tracking_checked_at timestamptz,
  add column if not exists tracking_error text,
  add column if not exists shipped_at timestamptz,
  add column if not exists received_at timestamptz;

create index if not exists supplier_batches_tracking_open
  on public.supplier_batches (tracking_checked_at)
  where tracking_number is not null and received_at is null;
