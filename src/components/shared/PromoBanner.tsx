import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import priceList from "@/data/price-list.json";

/**
 * Site-wide strip for the "3 player shirts for 300" bundle (owner request
 * 2026-11-04: "create code 3FOR299 and put it instantly when they buy ...
 * put a banner of the code use 3for299 to get the promotion"). There is no
 * code to type - src/lib/pricing/engine.ts's `bundle_3` offer applies the
 * moment 3+ eligible shirts are in the cart, same as the price list already
 * described before today ("3FOR299" is just this deal's name for the ad/
 * banner, matching the Meta campaign). Add-ons (name/number, patches, size)
 * are never discounted - the engine only ever lowers the shirt's own price.
 *
 * Reads `active` straight off the exported price list rather than hardcoding
 * "on" - the one place this deal's state lives is admin Pricing (offer
 * `bundle_3`), so turning it off there removes the banner on the next build
 * with no code change, and a stale cached build never shows a dead promo.
 */
type PL = { offers?: { id: string; active: boolean; unit_price: { short: number; long?: number } }[] };
const bundle3 = (priceList as unknown as PL).offers?.find((o) => o.id === "bundle_3");

export async function PromoBanner() {
  if (!bundle3?.active) return null;
  const t = await getTranslations("promo");

  return (
    <Link
      href="/shop"
      className="block border-b border-rule bg-accent px-4 py-2.5 text-center text-sm font-medium text-accent-ink transition-opacity hover:opacity-90"
    >
      {t("bundle3")}
      <span className="mx-2 opacity-70">·</span>
      <span className="underline underline-offset-2">{t("cta")}</span>
    </Link>
  );
}
