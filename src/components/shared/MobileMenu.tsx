"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { BrandBadge } from "@/components/shared/BrandBadge";
import { CartLink } from "@/components/shared/CartLink";
import { LocaleToggle } from "@/components/shared/LocaleToggle";
import type { League } from "@/data/catalog";

/**
 * Below 900px the nav collapses to a hamburger that opens a full-screen menu.
 *
 * The overlay is new to this wave — the mockup has no mobile state — so it is
 * built from the same vocabulary as everything else: the page ground, hairline
 * rules, mono eyebrows for the group labels (Latin only; the globals rule
 * neutralises them in Arabic), and large quiet links. No new colours, no new
 * shapes, no new radius.
 *
 * The trigger is positioned with logical properties, so it sits at the inline
 * start in English and mirrors in Arabic without a second rule.
 */
export function MobileMenu({ leagues }: { leagues: League[] }) {
  const t = useTranslations("nav");
  const tShop = useTranslations("shop");
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // A navigation closes the menu: the overlay is a route picker, and leaving
  // it open over the new page would trap the reader.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // While open, freeze the page behind it and let Escape dismiss.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("openMenu")}
        aria-expanded={open}
        className="-ms-2 flex h-9 w-9 shrink-0 flex-col justify-center gap-[5px] ps-2 wide:hidden"
      >
        <span aria-hidden className="block h-px w-5 bg-ink" />
        <span aria-hidden className="block h-px w-5 bg-ink" />
        <span aria-hidden className="block h-px w-5 bg-ink" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("menuBrowse")}
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-ground"
        >
          <div className="flex items-center justify-between border-b border-rule px-6 py-5">
            {/* Same lockup as the header behind it, so the overlay reads as
                the same site rather than a second surface. Decorative badge
                for the same reason: the wordmark is right there. */}
            <span className="flex items-center gap-2.5">
              <BrandBadge size={30} alt="" />
              <span className="wordmark">KitVerse</span>
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("closeMenu")}
              className="text-sm text-ink-soft transition-colors hover:text-ink"
            >
              {t("closeMenu")}
            </button>
          </div>

          <nav className="flex flex-col px-6 pb-16">
            <MenuGroup label={t("menuBrowse")}>
              <MenuLink href="/shop">{t("shop")}</MenuLink>
              <MenuLink href="/shop/national-teams">{t("nationalTeams")}</MenuLink>
              <MenuLink href="/shop/new-season">{tShop("kinds.current")}</MenuLink>
              <MenuLink href="/shop/last-season">{tShop("kinds.previous")}</MenuLink>
            </MenuGroup>

            {leagues.length > 0 ? (
              <MenuGroup label={t("leagues")}>
                {leagues.map((league) => (
                  <MenuLink key={league.slug} href={`/shop/${league.slug}`}>
                    {locale === "ar" ? league.nameAr : league.name}
                  </MenuLink>
                ))}
              </MenuGroup>
            ) : null}

            <MenuGroup label={t("menuHelp")}>
              <MenuLink href="/size-guide">{t("sizeGuide")}</MenuLink>
              <MenuLink href="/shipping">{t("shipping")}</MenuLink>
              <MenuLink href="/about">{t("about")}</MenuLink>
            </MenuGroup>

            <div className="flex items-center justify-between gap-6 border-t border-rule pt-6 text-sm text-ink-soft">
              <Link href="/search" className="transition-colors hover:text-ink">
                {t("search")}
              </Link>
              <CartLink />
              <LocaleToggle />
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}

function MenuGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-rule py-7">
      <span className="mono-eyebrow mb-4 block text-ink-soft">{label}</span>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-xl transition-colors hover:text-ink-soft">
      {children}
    </Link>
  );
}
