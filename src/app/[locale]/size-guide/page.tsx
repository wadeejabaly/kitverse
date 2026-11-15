import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { KIDS_SIZE_CHART, sizeSurcharge } from "@/data/pricing";
import { FAN_CHART, PLAYER_CHART, PLAYER_NARROWER_CM, SHORTS_CHART, type Range } from "@/data/size-charts";
import { KidsSizeHelper } from "@/components/product/KidsSizeHelper";
import { SizeHelper } from "@/components/product/SizeHelper";
import { MeasureChart, type ChartColumn, type ChartRow } from "@/components/size/MeasureChart";
import { PageLede, Wrap } from "@/components/shared/PageLede";
import { Icon, INSTAGRAM_URL } from "@/components/shared/Info";
import { Link } from "@/i18n/navigation";
import { alternatesFor } from "@/lib/site";

/**
 * Size guide (full redesign, owner request 2026-11-15: "redesign the size page, all of it, do it well" +
 * "I want all the measurements, for the adults too"). Every number is the supplier's own chart
 * (src/data/size-charts.ts, KIDS_SIZE_CHART) - nothing estimated except the kids weights (marked there).
 * Order: jump links -> both size finders -> Fan -> Player -> full-kit shorts -> kids kits -> how to
 * measure -> questions -> help. Anchors #fan #player #kits #kids are linked from product pages.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "sizeGuide" });
  return { title: t("title"), description: t("metaDescription"), alternates: alternatesFor(locale, "/size-guide") };
}

const cm = (v: number | null) => (v == null ? null : `${v}`);
const range = (r: Range | null) => (r ? `${r[0]}-${r[1]}` : null);

export default async function SizeGuidePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("sizeGuide");

  const chartLabels = { size: t("colSize"), pick: t("pickSize"), na: t("noMeasure"), tapHint: t("tapHint") };

  const fanCols: ChartColumn[] = [
    { key: "chest", label: t("mChest"), measure: "chest", mark: "A" },
    { key: "length", label: t("mLength"), measure: "length", mark: "B" },
    { key: "sleeve", label: t("mSleeveShort"), measure: "sleeve", mark: "C" },
    { key: "cuff", label: t("mCuff"), measure: "cuff", mark: "D" },
    { key: "sleeveLong", label: t("mSleeveLong") },
    { key: "height", label: t("fHeight"), fit: true },
    { key: "weight", label: t("fWeight"), fit: true },
  ];
  // the long sleeve is a measurement with no line on the drawing (same as C, on a long-sleeve shirt)
  const fanRows: ChartRow[] = FAN_CHART.map((r) => ({
    size: r.size,
    cells: { chest: cm(r.chest), length: cm(r.length), sleeve: cm(r.sleeve), cuff: cm(r.cuff), sleeveLong: cm(r.sleeveLong), height: range(r.height), weight: range(r.weight) },
  }));

  const playerCols: ChartColumn[] = [
    { key: "chest", label: t("mChest"), measure: "chest", mark: "A" },
    { key: "length", label: t("mLength"), measure: "length", mark: "B" },
    { key: "sleeve", label: t("mSleeve"), measure: "sleeve", mark: "C" },
    { key: "shoulder", label: t("mShoulder"), measure: "shoulder", mark: "D" },
    { key: "height", label: t("fHeight"), fit: true },
    { key: "weight", label: t("fWeight"), fit: true },
  ];
  const playerRows: ChartRow[] = PLAYER_CHART.map((r) => ({
    size: r.size,
    cells: { chest: cm(r.chest), length: cm(r.length), sleeve: cm(r.sleeve), shoulder: cm(r.shoulder), height: range(r.height), weight: range(r.weight) },
  }));

  const shortsCols: ChartColumn[] = [
    { key: "waist", label: t("mWaist"), measure: "waist", mark: "A" },
    { key: "length", label: t("mShortsLength"), measure: "shortsLength", mark: "B" },
    { key: "height", label: t("fHeight"), fit: true },
    { key: "weight", label: t("fWeight"), fit: true },
  ];
  const shortsRows: ChartRow[] = SHORTS_CHART.map((r) => ({
    size: r.size,
    cells: { waist: cm(r.waist), length: cm(r.length), height: range(r.height), weight: range(r.weight) },
  }));

  const kidsCols: ChartColumn[] = [
    { key: "chest", label: t("mChest"), measure: "chest", mark: "A" },
    { key: "length", label: t("mLength"), measure: "length", mark: "B" },
    { key: "waist", label: t("mWaistKids"), measure: "waist", mark: "C" },
    { key: "shorts", label: t("mShortsLength"), measure: "shortsLength", mark: "D" },
    { key: "age", label: t("fAge"), fit: true },
    { key: "height", label: t("fHeight"), fit: true },
    { key: "weight", label: t("fWeightKids"), fit: true },
  ];
  const kidsRows: ChartRow[] = KIDS_SIZE_CHART.map((r) => ({
    size: r.size,
    sub: r.letter,
    cells: { chest: cm(r.halfBust), length: cm(r.length), waist: range(r.halfWaist), shorts: cm(r.shortsLength), age: range(r.age), height: range(r.height), weight: range(r.weight) },
  }));

  const nav = [
    ["finder", t("navFinder")],
    ["fan", t("navFan")],
    ["player", t("navPlayer")],
    ["kits", t("navKits")],
    ["kids", t("navKids")],
    ["measure", t("navMeasure")],
    ["faq", t("navFaq")],
  ] as const;

  const faq = [
    ["faqBetweenQ", "faqBetweenA"],
    ["faqFanPlayerQ", "faqFanPlayerA"],
    ["faqLongQ", "faqLongA"],
    ["faqBigQ", "faqBigA"],
    ["faqRetroQ", "faqRetroA"],
    ["faqKidsQ", "faqKidsA"],
  ] as const;

  return (
    <Wrap>
      <PageLede eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")}>
        <span className="kv-chip !border-white/25 !bg-white/10 !text-white">{t("chipSupplier")}</span>
        <span className="kv-chip !border-white/25 !bg-white/10 !text-white">{t("chipRange")}</span>
        <span className="kv-chip !border-white/25 !bg-white/10 !text-white">{t("chipTolerance")}</span>
      </PageLede>

      <nav aria-label={t("navLabel")} className="kv-sg-nav">
        {nav.map(([id, label]) => (
          <a key={id} href={`#${id}`}>{label}</a>
        ))}
      </nav>

      <div className="flex flex-col gap-12 py-8 wide:gap-16 wide:py-12">
        {/* 1. the two size finders */}
        <section id="finder" className="kv-sg-section grid gap-5 wide:grid-cols-2">
          <div className="kv-panel flex flex-col p-5 sm:p-6">
            <div className="flex gap-4">
              <span className="kv-icon-tile"><Icon name="shirt" /></span>
              <div className="min-w-0">
                <h2 className="text-[18px] font-extrabold">{t("finderAdultTitle")}</h2>
                <p className="mt-1 text-[14px] text-ink-soft">{t("finderAdultBody")}</p>
              </div>
            </div>
            <SizeHelper startOpen />
          </div>
          <div className="kv-panel flex flex-col p-5 sm:p-6">
            <div className="flex gap-4">
              <span className="kv-icon-tile"><Icon name="star" /></span>
              <div className="min-w-0">
                <h2 className="text-[18px] font-extrabold">{t("finderKidsTitle")}</h2>
                <p className="mt-1 text-[14px] text-ink-soft">{t("finderKidsBody")}</p>
              </div>
            </div>
            <KidsSizeHelper startOpen />
          </div>
        </section>

        {/* 2. fan */}
        <section id="fan" className="kv-sg-section">
          <div className="kv-sg-head">
            <h2 className="kv-section-title">{t("fanTitle")}</h2>
            <span className="kv-sg-fit">{t("fanFit")}</span>
          </div>
          <p className="mb-5 max-w-[68ch] text-[15px] text-ink-soft">{t("fanBody")}</p>
          <div className="kv-panel overflow-hidden">
            <MeasureChart columns={fanCols} rows={fanRows} figure="shirt" defaultSize="L" labels={chartLabels} />
          </div>
          <p className="mt-3 text-[13.5px] font-semibold text-ink">
            {t("surcharge", { xl3: `₪${sizeSurcharge("3XL")}`, xl4: `₪${sizeSurcharge("4XL")}` })}
          </p>
        </section>

        {/* 3. player */}
        <section id="player" className="kv-sg-section">
          <div className="kv-sg-head">
            <h2 className="kv-section-title">{t("playerTitle")}</h2>
            <span className="kv-sg-fit" data-tone="slim">{t("playerFit")}</span>
          </div>
          <p className="mb-5 max-w-[68ch] text-[15px] text-ink-soft">{t("playerBody", { cm: PLAYER_NARROWER_CM })}</p>
          <div className="kv-sg-compare mb-5">
            <div className="kv-panel flex gap-3 p-4">
              <span className="kv-sg-fit h-fit">{t("navFan")}</span>
              <p className="text-[14px] text-ink-soft">{t("compareFan")}</p>
            </div>
            <div className="kv-panel flex gap-3 p-4">
              <span className="kv-sg-fit h-fit" data-tone="slim">{t("navPlayer")}</span>
              <p className="text-[14px] text-ink-soft">{t("comparePlayer", { cm: PLAYER_NARROWER_CM })}</p>
            </div>
          </div>
          <div className="kv-panel overflow-hidden">
            <MeasureChart columns={playerCols} rows={playerRows} figure="shirt" defaultSize="L" labels={chartLabels} />
          </div>
        </section>

        {/* 4. adult full kits: the shorts */}
        <section id="kits" className="kv-sg-section">
          <div className="kv-sg-head">
            <h2 className="kv-section-title">{t("kitsTitle")}</h2>
          </div>
          <p className="mb-5 max-w-[68ch] text-[15px] text-ink-soft">{t("kitsBody")}</p>
          <div className="kv-panel overflow-hidden">
            <MeasureChart columns={shortsCols} rows={shortsRows} figure="shorts" defaultSize="L" labels={chartLabels} />
          </div>
        </section>

        {/* 5. kids kits (anchor #kids is linked from /kids-kits) */}
        <section id="kids" className="kv-sg-section">
          <div className="kv-sg-head">
            <h2 className="kv-section-title">{t("kidsTitle")}</h2>
            <span className="kv-sg-fit" data-tone="kids">{t("kidsFit")}</span>
          </div>
          <p className="mb-5 max-w-[68ch] text-[15px] text-ink-soft">{t("kidsBody")}</p>
          <div className="kv-panel overflow-hidden">
            <MeasureChart columns={kidsCols} rows={kidsRows} figure="kit" defaultSize="22" labels={chartLabels} />
          </div>
          <p className="mt-3 text-[12.5px] text-ink-soft">{t("kidsWeightNote")}</p>
        </section>

        {/* 6. how to measure */}
        <section id="measure" className="kv-sg-section">
          <h2 className="kv-section-title mb-5">{t("measureTitle")}</h2>
          <ol className="grid gap-4 wide:grid-cols-3">
            {(["step1", "step2", "step3"] as const).map((k, i) => (
              <li key={k} className="kv-panel flex gap-3.5 p-5">
                <span className="kv-sg-step-num latin">{i + 1}</span>
                <div className="min-w-0">
                  <h3 className="text-[15.5px] font-extrabold">{t(`${k}Title`)}</h3>
                  <p className="mt-1 text-[14px] text-ink-soft">{t(`${k}Body`)}</p>
                </div>
              </li>
            ))}
          </ol>
          <ul className="mt-4 grid gap-2.5 text-[14px] sm:grid-cols-2">
            {(["howChest", "howLength", "howSleeve", "howWaist"] as const).map((k) => (
              <li key={k} className="flex gap-2.5">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#1f5cff]" />
                <span className="text-ink-soft">{t(k)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 7. questions */}
        <section id="faq" className="kv-sg-section">
          <h2 className="kv-section-title mb-2">{t("faqTitle")}</h2>
          <div className="kv-panel px-5 sm:px-6">
            {faq.map(([q, a], i) => (
              <details key={q} className="kv-acc" open={i === 0}>
                <summary>
                  {t(q)}
                  <span aria-hidden className="kv-acc-icon"><span /><span /></span>
                </summary>
                <p className="max-w-[68ch] pb-4 text-[14.5px] text-ink-soft">
                  {t(a, { xl3: `₪${sizeSurcharge("3XL")}`, xl4: `₪${sizeSurcharge("4XL")}`, cm: PLAYER_NARROWER_CM })}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* 8. still not sure */}
        <section className="kv-sg-cta flex flex-col gap-5 p-6 sm:p-8 wide:flex-row wide:items-center wide:justify-between">
          <div className="max-w-[56ch]">
            <h2 className="text-[22px] font-extrabold">{t("ctaTitle")}</h2>
            <p className="mt-2 text-[15px] text-white/75">{t("ctaBody")}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="btn">
              <span aria-hidden className="inline-flex size-5 [&_svg]:size-5"><Icon name="chat" /></span>
              {t("ctaInstagram")}
            </a>
            <Link href="/shop" className="inline-flex items-center rounded-[10px] border border-white/30 px-5 py-3 text-[14px] font-bold text-white hover:bg-white/10">
              {t("shopCta")}
            </Link>
          </div>
        </section>
      </div>
    </Wrap>
  );
}
