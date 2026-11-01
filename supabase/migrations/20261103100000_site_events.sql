-- Owner request 2026-11-03: "make in admin site stats traffic checkout and add to cart how many
-- people visited and all this valuable info" - until now the site collected NO traffic data at all
-- (no analytics pixel was ever wired up; ConsentGatedScript existed but nothing used it). This is the
-- storefront's own first-party event log: page views, add-to-cart clicks, and checkout starts. Orders
-- (the funnel's last step) already live in the `orders` table and aren't duplicated here.
--
-- Anonymous and session-scoped on purpose: `session_id` is a random id a visitor's browser keeps in
-- sessionStorage (cleared when the tab closes), never a persistent cross-visit cookie, never tied to a
-- customer record. No IP, no user agent, no full URL/query string - `referrer_host` is a hostname only.
-- That's what makes this plain operational traffic counting rather than something that needs the
-- marketing-cookie consent banner (ConsentProvider/ConsentGatedScript) gating it.
create table public.site_events (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('page_view', 'add_to_cart', 'checkout_start')),
  session_id text not null,
  path text,
  -- the product handle, not a product_id FK: both the catalog's static JSON and the cart's stored
  -- lines key products by handle, never a uuid, so this avoids a handle->id lookup on every event.
  product_handle text,
  locale text,
  referrer_host text,
  created_at timestamptz not null default now()
);

create index site_events_type_created_idx on public.site_events (type, created_at);
create index site_events_session_idx on public.site_events (session_id);

alter table public.site_events enable row level security;
-- Same shape as every other table: staff (admin stats page) get full access via is_staff(); every
-- insert comes from /api/track's service-role client, which bypasses RLS entirely, so there is no
-- public/anon policy here at all - same pattern as orders, which the public website also writes to
-- only through a service-role server route, never directly.
create policy staff_all on public.site_events for all to authenticated using (public.is_staff()) with check (public.is_staff());
