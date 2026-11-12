"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { BrandBadge } from "@/components/shared/BrandBadge";
import { CartLink } from "@/components/shared/CartLink";
import { LocaleToggle } from "@/components/shared/LocaleToggle";
import type { NavColumn, NavEntry, NavLink } from "@/lib/nav-data";

/**
 * Below 900px the nav collapses to a hamburger that opens a full-screen menu (owner request
 * 2026-11-12): the same six entries as the desktop header, each category an expandable row, and the
 * leagues nested one level further (league -> its clubs). Navy + gold like the desktop dropdowns
 * (.kv-mnav* in globals.css). Search and the bag stay in the header bar itself, so they are one tap
 * away without opening the menu; they are repeated at the bottom of the menu too.
 */
export function MobileMenu({ entries }: { entries: NavEntry[] }) {
  const viewAll = useTranslations("nav")("viewAll");
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // A navigation closes the menu: the overlay is a route picker.
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
        className="-ms-2 flex h-9 w-9 shrink-0 flex-col justify-center gap-[5px] ps-2 nav:hidden"
      >
        <span aria-hidden className="block h-px w-5 bg-ink" />
        <span aria-hidden className="block h-px w-5 bg-ink" />
        <span aria-hidden className="block h-px w-5 bg-ink" />
      </button>

      {open ? (
        <div role="dialog" aria-modal="true" aria-label={t("menuBrowse")} className="kv-mnav kv-mnav-enter fixed inset-0 z-50 flex flex-col overflow-y-auto">
          <div className="flex items-center justify-between border-b border-[rgb(201_165_92_/_0.25)] px-6 py-4">
            <BrandBadge size={44} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("closeMenu")}
              className="grid h-10 w-10 place-items-center text-[var(--flood-ink)] transition-colors hover:text-[var(--flood-gold)]"
            >
              <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <nav aria-label={t("menuBrowse")} className="flex flex-1 flex-col px-6 pb-8">
            {entries.map((entry) =>
              entry.panel ? (
                <div key={entry.id}>
                  <button
                    type="button"
                    className="kv-mnav-row"
                    aria-expanded={expanded === entry.id}
                    onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                  >
                    <span>{entry.label}</span>
                    <Chevron />
                  </button>
                  <div className="kv-mnav-sub" data-open={expanded === entry.id}>
                    <div>
                      <div className="pb-3 pt-1">
                        {entry.panel.cta ? (
                          <ItemLink link={entry.panel.cta} className="kv-mnav-sublink font-bold !text-[var(--flood-gold)]" />
                        ) : null}
                        {entry.panel.columns.map((column, index) => (
                          <MobileColumn key={index} column={column} viewAll={viewAll} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <Link key={entry.id} href={entry.href ?? "/"} className="kv-mnav-row">
                  {entry.label}
                </Link>
              ),
            )}

            {/* Search, bag and language once more at the bottom, on a light strip so they keep their usual look. */}
            <div className="mt-8 flex items-center justify-between gap-6 bg-ground px-4 py-4 text-sm text-ink">
              <Link href="/search" className="font-bold transition-colors hover:text-ink-soft">
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

/** A league column (heading with a link) becomes a nested expandable row; anything else lists its links. */
function MobileColumn({ column, viewAll }: { column: NavColumn; viewAll: string }) {
  const [open, setOpen] = useState(false);
  const heading = column.heading;
  if (heading?.href) {
    return (
      <div>
        <button type="button" className="kv-mnav-subrow" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span>{heading.label}</span>
          <Chevron />
        </button>
        <div className="kv-mnav-sub" data-open={open}>
          <div>
            <div className="ps-4 pb-2">
              <ItemLink link={{ href: heading.href, label: viewAll }} className="kv-mnav-sublink font-bold !text-[var(--flood-gold)]" />
              {column.links.map((link) => (
                <ItemLink key={link.href} link={link} className="kv-mnav-sublink" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div>
      {heading ? <span className="kv-mnav-label">{heading.label}</span> : null}
      <div className={column.flow ? "grid grid-cols-2 gap-x-6" : ""}>
        {column.links.map((link) => (
          <ItemLink key={link.href} link={link} className="kv-mnav-sublink" />
        ))}
      </div>
    </div>
  );
}

function ItemLink({ link, className }: { link: NavLink; className: string }) {
  if (link.plain) {
    return (
      <a href={link.href} className={className}>
        {link.label}
      </a>
    );
  }
  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden className="kv-nav-chevron">
      <path d="M3.5 6 8 10.5 12.5 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
