import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Accessory } from "@/data/types";
import { Reveal } from "@/components/motion/Reveal";
import { Price } from "@/components/shared/Money";

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
  const title = locale === "ar" ? accessory.teamAr : accessory.team;
  const label = t("keychainTitle", { team: title });

  return (
    <Link href={`/accessories/keychains/${accessory.handle.replace(/^keychain-/, "")}`} className="group block text-start">
      <div className="mb-3.5 grid aspect-square place-items-center overflow-hidden bg-tile ring-1 ring-inset ring-transparent transition-colors duration-300 ease-out group-hover:ring-electric">
        <Image
          src={accessory.image}
          alt={label}
          width={900}
          height={900}
          priority={priority}
          sizes="(max-width: 640px) 50vw, (max-width: 900px) 33vw, 280px"
          className="h-auto w-[86%] transition-transform duration-300 ease-out group-hover:scale-[1.03]"
        />
      </div>
      <h3 className="mb-1 text-sm font-normal">{label}</h3>
      <div className="flex items-baseline justify-between gap-2.5">
        <span className="mono-eyebrow text-ink-soft">{title}</span>
        <span className="flex items-baseline gap-2 text-sm text-accent transition-colors duration-300 ease-out group-hover:text-electric">
          <Price value={accessory.price} />
        </span>
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
