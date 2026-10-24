-- Kitverse core schema v1 (2026-09-30)
-- Conventions: uuid PKs, created_at/updated_at, money in agorot (integer),
-- enum-like columns = text + CHECK (full vocabulary reserved up front),
-- RLS enabled on every table. The bot/server uses the service role;
-- staff (owner + admin) use Supabase Auth and get full access via is_staff().

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------- staff
create table public.staff_users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'staff' check (role in ('owner','admin','staff')),
  locale text not null default 'ar' check (locale in ('ar','en')),
  created_at timestamptz not null default now()
);

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_users where id = auth.uid())
$$;
revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated, service_role;

-- ---------------------------------------------------------------- catalog
create table public.leagues (
  id text primary key,
  name_en text not null,
  name_ar text,
  name_he text
);

create table public.teams (
  id text primary key,                          -- slug
  name_en text not null,
  name_ar text,
  name_he text,
  aliases text[] not null default '{}',         -- spellings customers type
  type text not null check (type in ('club','national')),
  league_id text references public.leagues(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index teams_name_trgm on public.teams using gin (name_en extensions.gin_trgm_ops);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  handle text not null unique,
  team_id text not null references public.teams(id),
  season text,                                  -- '2025/26' | '2026' | '1998/99'
  kit text not null check (kit in ('Home','Away','Third','Fourth','Goalkeeper','Special','Unstated')),
  era text not null check (era in ('current','retro')),
  title_en text not null,
  title_ar text,
  title_he text,
  status text not null default 'available'
    check (status in ('featured','available','on_request','hidden')),
  is_kit_with_shorts boolean not null default false,
  flags text[] not null default '{}',
  supplier_primary_album text,
  primary_image_url text,
  old_catalog_handle text,
  search_text text generated always as
    (lower(coalesce(title_en,'') || ' ' || coalesce(title_ar,'') || ' ' || coalesce(season,'') || ' ' || kit)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_team on public.products (team_id);
create index products_status on public.products (status);
create index products_search_trgm on public.products using gin (search_text extensions.gin_trgm_ops);

create table public.product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  audience text not null check (audience in ('adult','women','kids')),
  version text not null check (version in ('fan','player')),
  sleeve text not null check (sleeve in ('short','long')),
  sizes text[],                                 -- null = not captured yet
  supplier_album_ids text[] not null default '{}',
  is_active boolean not null default true,
  unique (product_id, audience, version, sleeve)
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  role text not null default 'front' check (role in ('front','back','detail','other')),
  source text not null check (source in ('supplier','cleaned','real','owner')),
  sort int not null default 0,
  embedding extensions.vector(1024),
  created_at timestamptz not null default now()
);
create index product_images_product on public.product_images (product_id);

-- ---------------------------------------------------------------- instagram media <-> products
create table public.ig_media (
  id text primary key,                          -- Instagram media id
  kind text not null check (kind in ('post','reel','story','ad','carousel_item')),
  parent_id text references public.ig_media(id),
  permalink text,
  shortcode text,
  caption text,
  image_url text,                               -- our saved copy (stories expire)
  posted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.ig_media_products (
  id uuid primary key default gen_random_uuid(),
  ig_media_id text not null references public.ig_media(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  carousel_index int,
  confidence numeric(4,3),
  status text not null default 'suggested' check (status in ('suggested','confirmed','rejected')),
  confirmed_by uuid references public.staff_users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (ig_media_id, product_id, carousel_index)
);

-- ---------------------------------------------------------------- pricing (versioned JSON, validated in app)
create table public.price_list_versions (
  id uuid primary key default gen_random_uuid(),
  version int not null unique,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  data jsonb not null,                          -- groups, addons, offers, delivery zones, payment rules
  notes text,
  published_at timestamptz,
  published_by uuid references public.staff_users(id),
  created_at timestamptz not null default now()
);
create unique index price_list_one_published on public.price_list_versions (status) where status = 'published';

create table public.ads (
  ad_id text primary key,
  name text,
  ig_media_id text references public.ig_media(id),
  offer_id text,                                -- id of an offer inside the published price list
  created_at timestamptz not null default now()
);

create table public.localities (
  id uuid primary key default gen_random_uuid(),
  name_ar text,
  name_he text,
  name_en text,
  aliases text[] not null default '{}',
  zone_id text not null,                        -- id of a delivery zone inside the price list
  unique (name_en)
);

-- ---------------------------------------------------------------- customers & conversations
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  ig_user_id text unique,
  ig_username text,
  display_name text,
  full_name text,
  phone text,
  phone_alt text,
  email text,
  preferred_language text check (preferred_language in ('ar','he','en')),
  tags text[] not null default '{}',
  notes text,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  recipient_name text,
  locality_id uuid references public.localities(id),
  town_text text,
  street text,
  house_number text,
  landmark text,
  zone_id text,
  phone text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  channel text not null default 'instagram' check (channel in ('instagram')),
  mode text not null default 'bot' check (mode in ('bot','draft','owner','paused','blocked')),
  mode_until timestamptz,
  stage text not null default 'arrival' check (stage in
    ('arrival','discovery','specifying','delivery_town','quote','details','confirmation','post_order','problem','closed')),
  source_type text check (source_type in ('ad','story','post','organic')),
  source_ref text,
  window_expires_at timestamptz,                -- IG 24h reply window
  last_customer_msg_at timestamptz,
  last_bot_msg_at timestamptz,
  bot_replies_total int not null default 0,
  unlimited_until timestamptz,                  -- admin per-chat override
  spam_blocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, channel)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  sender text not null check (sender in ('customer','bot','owner','system')),
  ig_message_id text unique,
  kind text not null default 'text' check (kind in
    ('text','image','audio','video','share','story_reply','story_mention','reaction','ad_referral','other')),
  text text,
  transcript text,
  media jsonb,
  ig_media_id text,
  reply_to_ig_message_id text,
  status text not null default 'received' check (status in ('received','draft','queued','sent','failed','discarded')),
  created_at timestamptz not null default now()
);
create index messages_conv_time on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------- approvals (created before orders because adjustments reference them)
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  order_id uuid,
  kind text not null check (kind in ('discount','compensation','availability_check','custom_print','change_after_batch',
    'cancellation','complaint','return','payment_exception','large_order','low_confidence','rate_limit','draft_reply','other')),
  priority text not null default 'urgent' check (priority in ('urgent','normal','quiet')),
  proposal jsonb not null default '{}',
  draft_reply text,
  status text not null default 'pending'
    check (status in ('pending','approved','edited','rejected','taken_over','expired')),
  final_reply text,
  decided_by uuid references public.staff_users(id),
  decided_at timestamptz,
  remind_at timestamptz,
  created_at timestamptz not null default now()
);
create index approvals_pending on public.approvals (status, created_at) where status = 'pending';

create table public.availability_answers (
  id uuid primary key default gen_random_uuid(),
  query_key text not null,                      -- normalised request, e.g. 'liverpool|2025/26|home'
  description text,
  answer text not null check (answer in ('available','not_available')),
  product_id uuid references public.products(id),
  price_group_id text,
  expires_at timestamptz,
  approval_id uuid references public.approvals(id),
  decided_by uuid references public.staff_users(id),
  created_at timestamptz not null default now()
);
create index availability_answers_key on public.availability_answers (query_key, created_at desc);

-- ---------------------------------------------------------------- orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 1001) unique,
  customer_id uuid not null references public.customers(id),
  conversation_id uuid references public.conversations(id),
  status text not null default 'draft' check (status in ('draft','quoted','awaiting_details','awaiting_confirmation',
    'confirmed','paid','in_supplier_batch','produced','at_warehouse','with_courier','delivered','cancelled','issue')),
  price_list_version_id uuid references public.price_list_versions(id),
  address jsonb,                                -- snapshot at confirmation
  zone_id text,
  subtotal int not null default 0 check (subtotal >= 0),
  discount_total int not null default 0 check (discount_total >= 0),
  delivery_fee int not null default 0 check (delivery_fee >= 0),
  total int not null default 0 check (total >= 0),
  currency text not null default 'ILS',
  payment_method text check (payment_method in ('cod','paypal')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','deposit_paid','paid','refunded','partially_refunded')),
  deposit_amount int not null default 0,
  quote jsonb,                                  -- last pricing-engine breakdown shown to the customer
  notes text,
  source_ad_id text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_status on public.orders (status);
create index orders_customer on public.orders (customer_id);
alter table public.approvals add constraint approvals_order_fk foreign key (order_id) references public.orders(id) on delete set null;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  description text,                             -- for on-request items not in the catalog
  audience text not null default 'adult' check (audience in ('adult','women','kids')),
  version text not null default 'player' check (version in ('fan','player')),
  sleeve text not null default 'short' check (sleeve in ('short','long')),
  size text not null,
  qty int not null default 1 check (qty between 1 and 50),
  print_name text,
  print_number text,
  patches text[] not null default '{}',
  box boolean not null default false,
  price_group_id text,
  offer_id text,
  unit_price int not null default 0,
  addons_price int not null default 0,
  line_total int not null default 0,
  created_at timestamptz not null default now()
);
create index order_items_order on public.order_items (order_id);

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor text not null check (actor in ('bot','owner','admin','system','customer')),
  actor_user uuid references public.staff_users(id),
  note text,
  created_at timestamptz not null default now()
);

create table public.adjustments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null check (kind in ('discount','free_item','compensation','rounding','discount_code')),
  amount int not null check (amount >= 0),
  reason text,
  approval_id uuid references public.approvals(id),
  discount_code text,
  created_at timestamptz not null default now(),
  -- every bot/owner discount needs an approval; codes carry their own authority
  check (approval_id is not null or kind = 'discount_code')
);

create table public.discount_codes (
  code text primary key,
  kind text not null check (kind in ('percent','fixed')),
  value int not null check (value > 0),
  min_order int not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses int,
  used_count int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  provider text not null check (provider in ('paypal','cash','bit')),
  provider_order_id text,
  capture_id text,
  amount int not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending','completed','failed','refunded','partially_refunded')),
  raw jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index payments_one_capture on public.payments (provider, capture_id) where capture_id is not null;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  provider text not null default 'greeninvoice',
  doc_id text,
  doc_number text,
  url text,
  kind text not null default 'invoice_receipt' check (kind in ('invoice_receipt','credit')),
  created_at timestamptz not null default now()
);

create table public.cash_collections (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) unique,
  amount int not null,
  status text not null default 'with_courier' check (status in ('with_courier','collected','remitted','missing')),
  collected_at timestamptz,
  remitted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- supplier
create table public.supplier_batches (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft' check (status in ('draft','sent','acknowledged','closed')),
  file_url text,
  notes text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.supplier_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.supplier_batches(id) on delete cascade,
  order_item_id uuid not null unique references public.order_items(id),
  status text not null default 'ordered' check (status in ('ordered','produced','shipped','received','problem')),
  note text
);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  order_item_id uuid references public.order_items(id),
  kind text not null check (kind in ('wrong_item','wrong_size','delay','damage','other')),
  description text,
  resolution text,
  approval_id uuid references public.approvals(id),
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- bot
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  trigger_message_ids uuid[] not null default '{}',
  model text,
  input_tokens int, output_tokens int, cache_read_tokens int, cache_write_tokens int,
  cost_usd numeric(10,5) not null default 0,
  tool_calls jsonb,
  outcome text check (outcome in ('replied','drafted','approval','handoff','blocked','rate_limited','error')),
  trace_id text,
  created_at timestamptz not null default now()
);
create index agent_runs_conv_time on public.agent_runs (conversation_id, created_at);
create index agent_runs_time on public.agent_runs (created_at);

create table public.style_examples (
  id uuid primary key default gen_random_uuid(),
  situation text not null,
  customer_text text,
  owner_reply text not null,
  lang text not null default 'ar',
  embedding extensions.vector(1024),
  source text,
  created_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  text_ar text not null,
  text_en text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  applies_to text not null default 'all' check (applies_to in ('all','post_order','pre_order')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.bot_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.staff_users(id),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- admin: notifications, push, audit
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.staff_users(id) on delete cascade,  -- null = all staff
  kind text not null,
  priority text not null default 'normal' check (priority in ('urgent','normal','quiet')),
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_unread on public.notifications (created_at desc) where read_at is null;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.staff_users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid references public.staff_users(id),
  actor_kind text not null default 'staff' check (actor_kind in ('staff','bot','system')),
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- updated_at triggers
do $$ declare t text; begin
  foreach t in array array['teams','products','customers','conversations','orders'] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS
do $$ declare t text; begin
  foreach t in array array['staff_users','leagues','teams','products','product_options','product_images','ig_media',
    'ig_media_products','price_list_versions','ads','localities','customers','addresses','conversations','messages',
    'approvals','availability_answers','orders','order_items','order_events','adjustments','discount_codes','payments',
    'invoices','cash_collections','supplier_batches','supplier_batch_items','issues','agent_runs','style_examples',
    'announcements','bot_settings','notifications','push_subscriptions','audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy staff_all on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

-- public storefront: read-only catalog + the published price list
create policy public_read on public.leagues for select to anon using (true);
create policy public_read on public.teams for select to anon using (true);
create policy public_read on public.products for select to anon using (status = 'featured');
create policy public_read on public.product_options for select to anon
  using (is_active and exists (select 1 from public.products p where p.id = product_id and p.status = 'featured'));
create policy public_read on public.product_images for select to anon
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'featured'));
create policy public_read on public.price_list_versions for select to anon using (status = 'published');
create policy public_read on public.localities for select to anon using (true);

-- audit log is append-only for staff
create policy staff_no_update on public.audit_log as restrictive for update to authenticated using (false);
create policy staff_no_delete on public.audit_log as restrictive for delete to authenticated using (false);
