import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * Branded 404 — a 404 is a brand moment, not a framework default. Reached via
 * the [...rest] catch-all's notFound(), so it renders inside the locale layout
 * with the correct lang/dir, footer and consent banner. Copy from messages.
 */
export default async function LocaleNotFound() {
  const t = await getTranslations("notFound");

  return (
    // Redesign phase 2: the stadium night, a big gold 404, the site button.
    <section className="kv-pagehero flex grow items-center">
      <div aria-hidden className="kv-pagehero-shade" />
      <div className="relative mx-auto flex w-full max-w-page flex-col gap-5 px-6 py-24">
        <p className="latin text-[clamp(4rem,12vw,8rem)] leading-none font-extrabold text-[#c9a55c]">404</p>
        <h1 className="kv-pagehero-title">{t("title")}</h1>
        <p className="kv-pagehero-intro">{t("body")}</p>
        <Link href="/" className="btn mt-2 self-start">
          {t("backHome")}
        </Link>
      </div>
    </section>
  );
}
