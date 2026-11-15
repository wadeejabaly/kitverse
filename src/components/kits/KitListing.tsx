import { getTranslations } from "next-intl/server";
import { kitProducts } from "@/data/catalog";
import { priceFor } from "@/data/pricing";
import type { ProductSet } from "@/data/types";
import { ProductGrid } from "@/components/shop/ProductCard";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { Price } from "@/components/shared/Money";
import { Link } from "@/i18n/navigation";

/**
 * Full kits (owner request 2026-11-15): /kits (adults) and /kids-kits. Shirt + shorts, priced from the
 * admin Pricing kit groups; a kit is listed only once the owner has uploaded its photos (store:export).
 * The kids page carries the kids size chart + calculator (owner: "add a kids calculator too").
 */
export async function KitListing({ locale, set }: { locale: string; set: ProductSet }) {
  const t = await getTranslations("kits");
  const kids = set === "kids_kit";
  const products = kitProducts(set);
  const from = kids ? priceFor("2026/27", "22", "fan", "short", set) : priceFor("2026/27", "M", "fan", "short", set);
  const player = kids ? null : priceFor("2026/27", "M", "player", "short", set);
  const title = kids ? t("kidsTitle") : t("adultTitle");

  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={title} intro={kids ? t("kidsIntro") : t("adultIntro")} crumbs={[{ label: title }]} />
      <section className="pt-8">
        <div className="kv-panel flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-[15px]">
          <span className="font-bold">{t("whatsIn")}</span>
          <span>{kids ? t("fanFrom") : t("fanFrom")} <Price value={from} className="font-extrabold" /></span>
          {player !== null ? <span>{t("playerFrom")} <Price value={player} className="font-extrabold" /></span> : null}
          <span className="text-ink-soft">{t("custom")}</span>
        </div>
      </section>
      {/* Kids sizes (owner 2026-11-15: "remove the size chart from here"): the full chart + calculator live
          on the size guide and the calculator on each kids kit page - here just one line pointing there. */}
      {kids ? (
        <p className="pt-4 text-[14px] text-ink-soft">
          {t("sizeHelp")}{" "}
          <Link href="/size-guide#kids" className="font-semibold text-[#1f5cff] underline-offset-4 hover:underline">
            {t("sizeHelpLink")}
          </Link>
        </p>
      ) : null}
      <section className="pt-8 pb-[clamp(72px,10vw,120px)]">
        {products.length ? (
          <ProductGrid products={products} locale={locale} />
        ) : (
          <p className="kv-panel p-6 text-center text-ink-soft">{t("empty")}</p>
        )}
      </section>
    </Wrap>
  );
}
