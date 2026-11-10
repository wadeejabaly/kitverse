import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Accessory } from "@/data/types";
import { Reveal } from "@/components/motion/Reveal";
import { Price } from "@/components/shared/Money";
import { accessoryHref, accessoryTeam, isInStock } from "@/data/accessories";
import { accessoryLabel } from "@/components/shop/accessoryLabel";

/**
 * The accessory tile — a keychain today, whatever else the Accessories
 * category grows later. Deliberately the same square-photo-on-tile shape as
 * <ProductCard/> (same hover scale, same electric-blue ring, same mono
 * price row) so a keychain reads as one more thing this shop sells rather
 * than a bolted-on second design. The only thing it drops is the
 * season/"view shirt" cross-fade under the title — an accessory has no
 * season to show instead, so the row is just the price, baseline-aligned
 * the same way.
 */
export function AccessoryCard({
  accessory,
  locale,
  priority = false,
}: {
  accessory: Accessory;
  locale: string;
  priority?: boolean;
}) {
  const t = useTranslations("accessories");
  const tCommon = useTranslations("common");
  const inStock = isInStock(accessory);
  const title = accessoryTeam(accessory, locale);
  const label = accessoryLabel(t, accessory, locale);

  return (
    <Link href={accessoryHref(accessory)} className="kv-pcard group text-start">
      <div className="kv-pcard-media">
        <Image
          src={accessory.image}
          alt={label}
          width={900}
          height={900}
          priority={priority}
          sizes="(max-width: 640px) 50vw, (max-width: 900px) 33vw, 280px"
          className={`h-auto w-[86%] mix-blend-multiply transition-transform${inStock ? "" : " opacity-50 grayscale"} duration-500 ease-out group-hover:scale-[1.05]`}
        />
      </div>
      <div className="kv-pcard-body">
        <span className="kv-pcard-team">{title}</span>
        <h3 className="kv-pcard-title">{label}</h3>
        <div className="kv-pcard-foot">
          {inStock ? (
            <Price value={accessory.price} className="kv-pcard-price" />
          ) : (
            <span className="mono-eyebrow text-ink-soft">{tCommon("outOfStock")}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** The same 2/3/4-up responsive grid <ProductGrid/> uses, for accessory tiles. */
export function AccessoryGrid({
  accessories,
  locale,
  priorityCount = 0,
  reveal = false,
}: {
  accessories: Accessory[];
  locale: string;
  priorityCount?: number;
  reveal?: boolean;
}) {
  const className = "grid grid-cols-2 gap-5 sm:grid-cols-3 wide:grid-cols-4";

  const cards = accessories.map((accessory, index) => (
    <AccessoryCard
      key={accessory.handle}
      accessory={accessory}
      locale={locale}
      priority={index < priorityCount}
    />
  ));

  if (reveal) {
    return (
      <Reveal stagger={70} className={className}>
        {cards}
      </Reveal>
    );
  }

  return <div className={className}>{cards}</div>;
}
