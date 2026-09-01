import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CookieSettingsButton } from "./CookieSettingsButton";

/**
 * Site footer: the legal links and the cookie settings control. Both are
 * mandatory — the store may not launch without a reachable privacy policy and
 * terms page. Wave 2 restyles this into the full footer (shop columns,
 * shipping, size guide); the links below stay.
 */
export async function Footer() {
  const t = await getTranslations("footer");
  // String, not number: next-intl would render ٢٠٢٦ for ar — Latin numerals
  // always, in every locale.
  const year = String(new Date().getFullYear());

  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex w-full max-w-page flex-col gap-4 px-6 py-10 text-sm text-ink-soft">
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          <Link
            href="/privacy"
            className="underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            {t("privacy")}
          </Link>
          <Link
            href="/terms"
            className="underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            {t("terms")}
          </Link>
          <CookieSettingsButton />
        </nav>
        <p>{t("tagline")}</p>
        <p className="tabular">
          <bdi>{t("rights", { year })}</bdi>
        </p>
      </div>
    </footer>
  );
}
