-- Photo quality checks (2026-10-02): every product photo is screened before customers see it.
alter table public.product_images add column supplier_hash text;
alter table public.product_images add column album_id text;
alter table public.product_images add column status text not null default 'unchecked'
  check (status in ('unchecked','good','bad','cropped'));
alter table public.product_images add column quality jsonb;          -- model's assessment
alter table public.product_images add column checked_at timestamptz;
create unique index product_images_product_url on public.product_images (product_id, url);
alter table public.products add column photo_status text not null default 'unchecked'
  check (photo_status in ('unchecked','good','none_clean','owner_upload'));
