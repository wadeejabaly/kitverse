-- Phone cases (owner request 2026-11-16): a third accessory category, sold with a phone-model choice.
-- The category check grows by one value and each line keeps the model the shopper picked. Additive only.
alter table public.order_accessories drop constraint if exists order_accessories_category_check;
alter table public.order_accessories add constraint order_accessories_category_check check (category in ('keychain', 'scarf', 'phone_case'));
alter table public.order_accessories add column if not exists model text; -- e.g. 'iPhone 15 Pro' (phone cases only)
