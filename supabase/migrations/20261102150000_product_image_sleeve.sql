-- A shirt's photo gallery is sleeve-specific on the storefront (ProductGallery.tsx swaps its whole
-- thumbnail row to imagesLongSleeve once the shopper picks "Long sleeve"), but product_images had no
-- way to say which set a photo belongs to - every photo was implicitly "short sleeve, and the only one".
-- This is what let ~700 real/gallery photos live entirely outside the database, in a hand-edited
-- catalog/store-selection.json + committed public/products/ files, invisible to admin (owner report
-- 2026-11-02: "there are photos in the website that dont appear in the admin").
alter table public.product_images add column sleeve text not null default 'short' check (sleeve in ('short', 'long'));
