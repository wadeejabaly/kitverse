import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { CONTACT_EMAIL, INSTAGRAM_HANDLE, INSTAGRAM_URL, Icon } from "@/components/shared/Info";
import { alternatesFor } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contactPage" });
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: alternatesFor(locale, "/contact"),
  };
}

/**
 * Contact (new in the phase-2 redesign, 2026-11-09). The shop's real
 * channels only: the email the owner gave (kitversejerseys@gmail.com),
 * Instagram DMs (where the shop already sells and answers), and the existing
 * self-serve order tracker at /o/track. The reply time is the one the site
 * already promises ("within two business days").
 */
export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contactPage");

  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} />

      <div className="flex flex-col gap-8 py-10 wide:py-14">
        <div className="grid gap-4 wide:grid-cols-3">
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="kv-panel group flex flex-col gap-3 p-6 transition-colors hover:border-[#1f5cff]"
          >
            <span className="kv-icon-tile">
              <Icon name="mail" />
            </span>
            <h2 className="text-[17px] font-extrabold">{t("emailTitle")}</h2>
            <p className="text-[14.5px] text-ink-soft">{t("emailBody")}</p>
            <span dir="ltr" className="latin mt-auto font-bold text-[#1f5cff] group-hover:underline">
              {CONTACT_EMAIL}
            </span>
          </a>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="kv-panel group flex flex-col gap-3 p-6 transition-colors hover:border-[#1f5cff]"
          >
            <span className="kv-icon-tile">
              <Icon name="chat" />
            </span>
            <h2 className="text-[17px] font-extrabold">{t("instagramTitle")}</h2>
            <p className="text-[14.5px] text-ink-soft">{t("instagramBody")}</p>
            <span dir="ltr" className="latin mt-auto font-bold text-[#1f5cff] group-hover:underline">
              {INSTAGRAM_HANDLE}
            </span>
          </a>
          {/* /o/track lives outside the [locale] tree — a plain anchor, as on /shipping. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- outside this root layout */}
          <a
            href="/o/track"
            className="kv-panel group flex flex-col gap-3 p-6 transition-colors hover:border-[#1f5cff]"
          >
            <span className="kv-icon-tile">
              <Icon name="box" />
            </span>
            <h2 className="text-[17px] font-extrabold">{t("trackTitle")}</h2>
            <p className="text-[14.5px] text-ink-soft">{t("trackBody")}</p>
            <span className="mt-auto font-bold text-[#1f5cff] group-hover:underline">{t("trackCta")}</span>
          </a>
        </div>

        <div className="kv-panel flex flex-col gap-4 p-6 wide:flex-row wide:items-center wide:justify-between wide:p-8">
          <div className="flex items-start gap-4">
            <span className="kv-icon-tile">
              <Icon name="clock" />
            </span>
            <div>
              <h2 className="text-[16px] font-extrabold">{t("replyTitle")}</h2>
              <p className="text-[14.5px] text-ink-soft">{t("replyBody")}</p>
            </div>
          </div>
          <Link href="/help" className="btn btn-quiet shrink-0">
            {t("helpCta")}
          </Link>
        </div>
      </div>
    </Wrap>
  );
}
