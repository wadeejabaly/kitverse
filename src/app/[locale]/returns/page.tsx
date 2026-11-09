import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { CONTACT_EMAIL, ContactPanel, Icon, InfoHeading } from "@/components/shared/Info";
import { alternatesFor } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "returnsPage" });
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: alternatesFor(locale, "/returns"),
  };
}

/**
 * Returns and refunds (its own page since the phase-2 redesign, 2026-11-09;
 * it used to be a section of /shipping). The rules are the owner's policy as
 * already published on /shipping (owner correction 2026-10-31, Part 6): no
 * returns or exchanges for size or a change of mind, defective items only —
 * the four rule texts are the SAME message keys /shipping used, not a
 * rewrite. The "how to report a defect" steps only spell out what that
 * policy already asks for (contact us with clear photos).
 *
 * The binding legal text stays on /terms, linked at the bottom.
 */
export default async function ReturnsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("returnsPage");
  const tPolicy = await getTranslations("shippingPage");
  const tHelp = await getTranslations("help");

  const rules = [
    { label: "returnsSizeLabel", body: "returnsSizeBody", ok: false },
    { label: "returnsExchangeLabel", body: "returnsExchangeBody", ok: false },
    { label: "returnsChangeOfMindLabel", body: "returnsChangeOfMindBody", ok: false },
    { label: "returnsDefectiveLabel", body: "returnsDefectiveBody", ok: true },
  ] as const;

  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("title")} intro={tPolicy("returnsIntro")} />

      <div className="flex flex-col gap-10 py-10 wide:gap-14 wide:py-14">
        <section>
          <InfoHeading eyebrow={t("rulesEyebrow")} title={t("rulesTitle")} />
          <div className="grid gap-4 sm:grid-cols-2">
            {rules.map((rule) => (
              <div
                key={rule.label}
                className={`kv-panel flex gap-4 p-6 ${rule.ok ? "!border-[#1f5cff]/40" : ""}`}
              >
                <span
                  aria-hidden
                  className={`grid size-10 shrink-0 place-items-center rounded-full ${
                    rule.ok ? "bg-[#1f5cff] text-white" : "bg-chip text-ink"
                  }`}
                >
                  {rule.ok ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8.3 6.3 11.5 13 4.5" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M4 4l8 8M12 4 4 12" />
                    </svg>
                  )}
                </span>
                <div>
                  <h3 className="mb-1 text-[16px] font-extrabold">{tPolicy(rule.label)}</h3>
                  <p className="text-[14.5px] leading-relaxed text-ink-soft">{tPolicy(rule.body)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <InfoHeading eyebrow={t("stepsEyebrow")} title={t("stepsTitle")} />
          <ol className="grid gap-4 wide:grid-cols-3">
            {(["one", "two", "three"] as const).map((step, index) => (
              <li key={step} className="kv-panel flex flex-col gap-3 p-6">
                <span className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-full bg-[var(--flood-ground)] font-extrabold text-white">
                    <span className="latin">{index + 1}</span>
                  </span>
                  <span className="kv-icon-tile !size-9 !rounded-[10px]">
                    <Icon name={step === "one" ? "camera" : step === "two" ? "mail" : "chat"} />
                  </span>
                </span>
                <h3 className="text-[16px] font-extrabold">{t(`steps.${step}.title`)}</h3>
                <p className="text-[14.5px] leading-relaxed text-ink-soft">
                  {t(`steps.${step}.body`, { email: CONTACT_EMAIL })}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <div className="kv-panel flex flex-col gap-3 p-6 wide:flex-row wide:items-center wide:justify-between wide:p-8">
          <div className="flex items-start gap-4">
            <span className="kv-icon-tile">
              <Icon name="ruler" />
            </span>
            <div>
              <h3 className="text-[16px] font-extrabold">{t("sizeTitle")}</h3>
              <p className="text-[14.5px] text-ink-soft">{tPolicy("returnsClosing")}</p>
            </div>
          </div>
          <Link href="/size-guide" className="btn shrink-0">
            {t("sizeCta")}
          </Link>
        </div>

        <p className="text-[13.5px] text-ink-soft">
          {t.rich("legal", {
            terms: (chunks) => (
              <Link href="/terms" className="font-semibold text-[#1f5cff] hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>

        <ContactPanel
          title={t("contactTitle")}
          body={t("contactBody")}
          emailLabel={tHelp("emailUs")}
          instagramLabel={tHelp("dmUs")}
        />
      </div>
    </Wrap>
  );
}
