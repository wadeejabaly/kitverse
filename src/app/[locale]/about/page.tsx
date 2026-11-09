import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getVisibleProducts } from "@/data/catalog";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { ContactPanel, Icon, InfoHeading, type IconName } from "@/components/shared/Info";
import { alternatesFor } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: alternatesFor(locale, "/about"),
  };
}

/**
 * About (redesign phase 2, 2026-11-09). Editorial blocks in the homepage's
 * language: the stadium page hero, then alternating photo/text rows using the
 * Higgsfield category photos (built from the shop's own catalog shots, see
 * src/components/home/category-images.ts), a "what you can count on" grid and
 * the contact panel.
 *
 * Every statement is one the shop already makes elsewhere (replicas, Fan and
 * Player, S–4XL, name and number, delivery window, replies within two
 * business days). No founding story, awards or certifications — the owner's
 * spec forbids inventing any, and none exist on record.
 */
export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");
  const tHelp = await getTranslations("help");
  const shirtCount = getVisibleProducts().length;

  const stories = [
    { key: "passion", image: "/home/stadium.webp", href: "/shop", position: "60% 40%" },
    { key: "collection", image: "/home/cat-clubs.webp", href: "/shop", position: "70% 40%" },
    { key: "national", image: "/home/cat-national.webp", href: "/shop/national-teams", position: "75% 40%" },
    { key: "retro", image: "/home/cat-retro.webp", href: "/shop/retro", position: "65% 30%" },
  ] as const;

  const promises: { icon: IconName; key: string }[] = [
    { icon: "camera", key: "photos" },
    { icon: "shirt", key: "versions" },
    { icon: "chat", key: "support" },
    { icon: "truck", key: "delivery" },
  ];

  return (
    <Wrap>
      <PageLede
        eyebrow={t("eyebrow")}
        title={t("title")}
        intro={t("body1")}
        art="/home/cat-clubs.webp"
      >
        <span className="kv-pagehero-stat">
          <strong className="latin">{shirtCount}</strong> {t("statShirts")}
        </span>
        <span className="kv-pagehero-stat">
          <strong className="latin">S–4XL</strong> {t("statSizes")}
        </span>
      </PageLede>

      <div className="flex flex-col gap-6 py-10 wide:gap-8 wide:py-16">
        {stories.map((story, index) => (
          <article
            key={story.key}
            className="kv-panel grid overflow-hidden wide:grid-cols-2"
          >
            <div
              className={`relative min-h-[220px] wide:min-h-[340px] ${index % 2 === 1 ? "wide:order-2" : ""}`}
            >
              <Image
                src={story.image}
                alt=""
                fill
                sizes="(max-width: 900px) 100vw, 590px"
                className="object-cover"
                style={{ objectPosition: story.position }}
              />
            </div>
            <div className="flex flex-col justify-center gap-3 p-6 wide:p-12">
              <span className="mono-eyebrow kv-flood-eyebrow-rule">{t(`stories.${story.key}.eyebrow`)}</span>
              <h2 className="kv-section-title">{t(`stories.${story.key}.title`)}</h2>
              <p className="text-ink-soft">{t(`stories.${story.key}.body`)}</p>
              <Link
                href={story.href}
                className="mt-2 inline-flex items-center gap-2 self-start border-b-2 border-[#1f5cff] pb-1 text-[14px] font-bold"
              >
                {t(`stories.${story.key}.cta`)}
                <span aria-hidden className="btn-flood-arrow">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
            </div>
          </article>
        ))}

        <section className="pt-6">
          <InfoHeading eyebrow={t("promiseEyebrow")} title={t("promiseTitle")} />
          <div className="grid gap-4 sm:grid-cols-2 wide:grid-cols-4">
            {promises.map((item) => (
              <div key={item.key} className="kv-panel flex flex-col gap-3 p-6">
                <span className="kv-icon-tile">
                  <Icon name={item.icon} />
                </span>
                <h3 className="text-[16px] font-extrabold">{t(`promises.${item.key}.title`)}</h3>
                <p className="text-[14px] leading-relaxed text-ink-soft">{t(`promises.${item.key}.body`)}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="pt-4">
          <ContactPanel
            title={t("contactTitle")}
            body={t("contactBody")}
            emailLabel={tHelp("emailUs")}
            instagramLabel={tHelp("dmUs")}
          />
        </div>
      </div>
    </Wrap>
  );
}
