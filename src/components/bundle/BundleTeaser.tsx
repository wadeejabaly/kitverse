import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BUNDLE_VERSION, availableBundles, customBundleEligible } from "@/data/bundles";
import { getProduct } from "@/data/catalog";
import { priceFor } from "@/data/pricing";
import { Price } from "@/components/shared/Money";

/**
 * "Get all three" card linking to a club's bundle (owner request 2026-11-12), shown on that club's shop
 * page and on the product page of each shirt in it. Renders nothing when there is no live bundle.
 */
export async function BundleTeaser({ locale, team, handle, className = "" }: { locale: string; team?: string; handle?: string; className?: string }) {
  const found = availableBundles().find(({ bundle }) => (team && bundle.team === team) || (handle && bundle.handles.includes(handle)));
  if (!found) return handle ? <BuildYourOwnTeaser locale={locale} handle={handle} className={className} /> : null;
  const { bundle, products } = found;
  const t = await getTranslations({ locale, namespace: "bundle" });
  const teamName = locale === "ar" ? products[0].teamAr : locale === "he" ? products[0].teamHe || products[0].team : products[0].team;
  const total = products.reduce((s, p) => s + priceFor(p.season, "M", BUNDLE_VERSION, "short", undefined, true), 0);

  return (
    <Link href={`/bundles/${bundle.slug}`} className={`group flex items-center gap-4 rounded-[14px] border border-rule bg-tile p-3 pe-5 transition-colors hover:border-ink ${className}`}>
      <span className="flex shrink-0 -space-x-4 rtl:space-x-reverse">
        {(bundle.image ? [bundle.image] : products.map((p) => p.image)).map((src) => (
          <span key={src} className="relative block size-14 overflow-hidden rounded-[10px] border border-rule bg-white">
            <Image src={src} alt="" fill sizes="56px" className="object-contain" />
          </span>
        ))}
      </span>
      <span className="min-w-0 grow">
        <span className="mono-eyebrow block text-[#1f5cff]">{t("teaserEyebrow")}</span>
        <span className="block font-extrabold text-ink">{t("title", { team: teamName })}</span>
        <span className="block text-[13px] text-ink-soft">{t("teaserBody")}</span>
      </span>
      <span className="shrink-0 text-end">
        <Price value={total} className="block font-extrabold text-ink" />
        <span className="text-[12px] font-semibold text-[#1f5cff] group-hover:underline">{t("viewBundle")}</span>
      </span>
    </Link>
  );
}

/**
 * On a shirt that has no club bundle (owner request 2026-11-17): "Build your own bundle" - starts the
 * bundle with this shirt already in slot 1. Only for shirts that can go in one (current season, not a kit).
 */
async function BuildYourOwnTeaser({ locale, handle, className }: { locale: string; handle: string; className: string }) {
  const p = getProduct(handle);
  if (!customBundleEligible(p)) return null;
  const t = await getTranslations({ locale, namespace: "bundle" });
  const each = priceFor(p.season, "M", BUNDLE_VERSION, "short", undefined, true);
  return (
    <Link href={`/bundles/build-your-own?first=${encodeURIComponent(handle)}`} className={`group flex items-center gap-4 rounded-[14px] border border-rule bg-tile p-3 pe-5 transition-colors hover:border-ink ${className}`}>
      <span className="flex shrink-0 -space-x-4 rtl:space-x-reverse">
        <span className="relative block size-14 overflow-hidden rounded-[10px] border border-rule bg-white">
          <Image src={p.image} alt="" fill sizes="56px" className="object-contain" />
        </span>
        {[0, 1].map((i) => (
          <span key={i} className="grid size-14 place-items-center rounded-[10px] border border-dashed border-rule bg-white text-2xl font-bold text-[#1f5cff]">+</span>
        ))}
      </span>
      <span className="min-w-0 grow">
        <span className="mono-eyebrow block text-[#1f5cff]">{t("teaserEyebrow")}</span>
        <span className="block font-extrabold text-ink">{t("customTitle")}</span>
        <span className="block text-[13px] text-ink-soft">{t("customTeaser")}</span>
      </span>
      <span className="shrink-0 text-end">
        <span className="block text-[12px] text-ink-soft">{t("fromLabel")}</span>
        <Price value={3 * each} className="block font-extrabold text-ink" />
      </span>
    </Link>
  );
}
