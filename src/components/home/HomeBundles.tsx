import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BUNDLE_VERSION, bundleWithProducts } from "@/data/bundles";
import { priceFor } from "@/data/pricing";
import { Price } from "@/components/shared/Money";
import { Reveal } from "@/components/motion/Reveal";
import { Wrap } from "@/components/shared/PageLede";
import { bundleTeam } from "@/app/[locale]/bundles/team-name";

/**
 * Bundles on the home page (owner request 2026-11-13: "put the bundles on the home page for now to
 * promote them - the Real Madrid and Barcelona ones"). Temporary promotion: to take it down, remove
 * <HomeBundles/> from src/app/[locale]/page.tsx; to change which bundles show, edit HOME_BUNDLES.
 * A bundle that is off the site (a shirt hidden / out of stock) is skipped; nothing renders if none is live.
 * Prices come from the price list (3 x the player price), never from here.
 */
const HOME_BUNDLES = ["real-madrid-2026-27", "barcelona-2026-27"];

export async function HomeBundles({ locale }: { locale: string }) {
  const bundles = HOME_BUNDLES.map((slug) => bundleWithProducts(slug)).filter((b): b is NonNullable<typeof b> => !!b);
  if (!bundles.length) return null;
  const t = await getTranslations({ locale, namespace: "bundle" });
  const tHome = await getTranslations({ locale, namespace: "home" });
  const tCommon = await getTranslations({ locale, namespace: "common" });

  return (
    <Wrap>
      <section className="pt-[clamp(48px,7vw,88px)] pb-[clamp(72px,11vw,140px)]">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-t border-rule pt-6">
          <div>
            <span className="mono-eyebrow">{tHome("bundlesEyebrow")}</span>
            <h2 className="display-sm mt-4">{tHome("bundlesTitle")}</h2>
            <p className="mt-3 max-w-[52ch] text-sm text-ink-soft">{t("teaserBody")}</p>
          </div>
          <Link href="/bundles" className="border-b border-rule pb-0.5 text-[13px] transition-colors hover:border-ink">
            {tCommon("viewAll")}
          </Link>
        </div>
        <Reveal stagger={90} className="grid gap-5 sm:grid-cols-2">
          {bundles.map(({ bundle, products }, i) => {
            const team = bundleTeam(products[0], locale);
            const total = products.reduce((s, p) => s + priceFor(p.season, "M", BUNDLE_VERSION), 0);
            return (
              <Link key={bundle.slug} href={`/bundles/${bundle.slug}`} className="kv-pcard group">
                <span className="kv-pcard-media">
                  {bundle.image ? (
                    <Image src={bundle.image} alt={t("title", { team })} fill priority={i === 0} sizes="(max-width: 640px) 100vw, 50vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                  ) : (
                    <span className="grid w-full grid-cols-3 gap-1 px-3">
                      {products.map((p) => (
                        <Image key={p.handle} src={p.image} alt="" width={400} height={400} sizes="(max-width: 640px) 33vw, 17vw" className="h-auto w-full mix-blend-multiply" />
                      ))}
                    </span>
                  )}
                </span>
                <span className="kv-pcard-body">
                  <span className="kv-pcard-team">{t("threeShirts")}</span>
                  <span className="kv-pcard-title text-[17px]">{t("title", { team })}</span>
                  <span className="mt-1 flex items-center justify-between gap-3">
                    <span className="kv-pcard-price"><Price value={total} /></span>
                    <span className="btn !px-4 !py-2 text-[13px]">{t("viewBundle")}</span>
                  </span>
                </span>
              </Link>
            );
          })}
        </Reveal>
      </section>
    </Wrap>
  );
}
