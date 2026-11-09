import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export interface Crumb {
  label: string;
  /** Omit on the current page — it renders as plain text with aria-current. */
  href?: string;
}

/**
 * Breadcrumbs (redesign phase 2, 2026-11-09). "Home" is always first; pass
 * the rest. `tone` picks the colours for a dark page hero or a light page.
 * The separator chevron is mirrored in RTL by .kv-crumbs-sep.
 */
export async function Breadcrumbs({
  items,
  tone = "dark",
  className,
}: {
  items: Crumb[];
  tone?: "dark" | "light";
  className?: string;
}) {
  const t = await getTranslations("nav");
  const all: Crumb[] = [{ label: t("home"), href: "/" }, ...items];
  return (
    <nav aria-label={t("breadcrumbs")} className={className}>
      <ol className={`kv-crumbs kv-crumbs--${tone}`}>
        {all.map((crumb, index) => {
          const last = index === all.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-[0.55rem]">
              {crumb.href && !last ? (
                <Link href={crumb.href}>{crumb.label}</Link>
              ) : (
                <span aria-current={last ? "page" : undefined}>{crumb.label}</span>
              )}
              {last ? null : (
                <span aria-hidden className="kv-crumbs-sep">
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M6 3.5 10.5 8 6 12.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
