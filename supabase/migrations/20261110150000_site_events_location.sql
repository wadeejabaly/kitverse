-- Owner request 2026-11-10: "add a real location yes" - site_events (20261103100000) deliberately
-- captured no location/IP at all. This adds real, server-derived geo without storing the visitor's
-- IP address itself: Vercel attaches `x-vercel-ip-country` / `x-vercel-ip-country-region` /
-- `x-vercel-ip-city` to every request at the edge (resolved from the request IP, which Next.js never
-- exposes to this app's code and which we never store). /api/track reads those three headers and
-- writes them here - absent in local dev (no edge network), so always nullable, same as every other
-- optional column on this table.
alter table public.site_events
  add column country text,
  add column country_region text,
  add column city text;

comment on column public.site_events.country is 'ISO country code from the Vercel edge request (x-vercel-ip-country). Null outside Vercel''s network (local dev).';
comment on column public.site_events.country_region is 'Region/state code from the Vercel edge request (x-vercel-ip-country-region).';
comment on column public.site_events.city is 'City name from the Vercel edge request (x-vercel-ip-city), URL-decoded.';
