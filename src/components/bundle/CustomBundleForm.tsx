"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ADDONS, GIFT_BOX_PRICE, patchesTotal, priceFor, round2 } from "@/data/pricing";
import { patchPieces } from "@/lib/patch-limits";
import { useCart } from "@/components/cart/CartProvider";
import { Figure, Price } from "@/components/shared/Money";
import { sanitizeNameNumber } from "@/lib/product";
import { OptionButton } from "@/components/product/ProductForm";
import { CUSTOM_BUNDLE_SIZE, newCustomBundleSlug } from "@/data/bundle-defs";
import { SaveNote, ShirtCard, START, type BundleShirt, type ShirtChoice } from "./BundleForm";

/** A shirt the shopper can pick, with the names the picker searches in. */
export interface PickableShirt extends BundleShirt {
  teamName: string;
  leagueName: string | null;
  /** lower-case words to search in (team + title in every language) */
  search: string;
}

interface Slot {
  shirt: PickableShirt | null;
  version: "fan" | "player";
  choice: ShirtChoice;
}

const EMPTY: Slot = { shirt: null, version: "player", choice: START };

/**
 * "Make your own bundle" (owner request 2026-11-17): any 3 current-season shirts from any teams, each
 * fan or player and customised on its own, at the bundle prices (admin Pricing bundle groups), plus an
 * optional gift box. Adding puts three ordinary jersey lines in the cart tagged with a fresh
 * "custom-<id>" slug; the cart, checkout and the server keep the bundle prices only while all three are
 * there (completeBundles in src/data/bundle-defs.ts).
 */
export function CustomBundleForm({ shirts, bundleTitle }: { shirts: PickableShirt[]; bundleTitle: string }) {
  const t = useTranslations("bundle");
  const tp = useTranslations("product");
  const tCommon = useTranslations("common");
  const { add, giftBoxes, setGiftBoxes, count: cartCount } = useCart();
  const [slots, setSlots] = useState<Slot[]>(() => Array.from({ length: CUSTOM_BUNDLE_SIZE }, () => EMPTY));
  const [picking, setPicking] = useState<number | null>(null);
  const [giftBox, setGiftBox] = useState(true);
  const [added, setAdded] = useState(false);

  // "?first=<handle>" (from a shirt page's teaser): start with that shirt in slot 1
  useEffect(() => {
    const first = new URLSearchParams(window.location.search).get("first");
    const shirt = first ? shirts.find((s) => s.handle === first) : undefined;
    if (shirt) setSlots((cur) => cur.map((s, i) => (i === 0 && !s.shirt ? { ...s, shirt } : s))); // eslint-disable-line react-hooks/set-state-in-effect
  }, [shirts]);

  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 8000);
    return () => window.clearTimeout(timer);
  }, [added]);

  const update = (i: number, patch: Partial<Slot>) => setSlots((cur) => cur.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const priced = slots.map((s) => {
    if (!s.shirt) return null;
    const name = s.choice.personalise ? sanitizeNameNumber(s.choice.nameNumber).trim() : "";
    const extras = (name ? ADDONS.nameNumber : 0) + patchesTotal(patchPieces(s.choice.patches, false));
    return {
      price: round2(priceFor(s.shirt.season, s.choice.size, s.version, s.choice.sleeve, undefined, true) + extras),
      normal: round2(priceFor(s.shirt.season, s.choice.size, s.version, s.choice.sleeve) + extras),
    };
  });
  const ready = slots.every((s) => s.shirt);
  const shirtsTotal = priced.reduce((n, p) => n + (p?.price ?? 0), 0);
  const total = round2(shirtsTotal + (giftBox ? GIFT_BOX_PRICE : 0));
  const saving = round2(priced.reduce((n, p) => n + (p ? p.normal - p.price : 0), 0));

  function onAdd() {
    if (!ready) return;
    const slug = newCustomBundleSlug();
    for (const s of slots) {
      const name = s.choice.personalise ? sanitizeNameNumber(s.choice.nameNumber).trim() : "";
      add({
        kind: "jersey",
        handle: s.shirt!.handle,
        size: s.choice.size,
        version: s.version,
        sleeve: s.choice.sleeve,
        patches: s.choice.patches,
        qty: 1,
        ...(name ? { nameNumber: name } : {}),
        bundle: slug,
      });
    }
    if (giftBox) setGiftBoxes(giftBoxes + 1);
    setAdded(true);
  }

  return (
    <div>
      <ol className="grid gap-5">
        {slots.map((s, i) => (
          <li key={i}>
            {s.shirt ? (
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-[13px] font-semibold text-ink-soft">
                    {t("shirtN", { n: i + 1 })} · {s.shirt.teamName}
                  </span>
                  <button type="button" onClick={() => setPicking(i)} className="text-[13px] font-semibold text-[#1f5cff] underline-offset-4 hover:underline">
                    {t("changeShirt")}
                  </button>
                </div>
                <fieldset className="mb-3 border-0 p-0">
                  <div className="flex flex-wrap gap-2">
                    {(["fan", "player"] as const).map((v) => (
                      <OptionButton key={v} pressed={s.version === v} onClick={() => update(i, { version: v })}>
                        {v === "fan" ? tp("versionFan") : tp("versionPlayer")}
                        <small className="ms-1.5 text-ink-soft">
                          <Price value={priceFor(s.shirt!.season, s.choice.size, v, s.choice.sleeve, undefined, true)} />
                        </small>
                      </OptionButton>
                    ))}
                  </div>
                </fieldset>
                <ShirtCard
                  shirt={s.shirt}
                  index={i}
                  choice={s.choice}
                  unitPrice={priced[i]!.price}
                  leagueName={s.shirt.leagueName}
                  onChange={(patch) => update(i, { choice: { ...s.choice, ...patch } })}
                  t={t}
                  tp={tp}
                  version={s.version}
                  label={s.shirt.title}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPicking(i)}
                className="flex w-full items-center gap-4 rounded-[16px] border-[1.5px] border-dashed border-rule bg-tile p-5 text-start transition-colors hover:border-[#1f5cff]"
              >
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[#1f5cff] text-2xl font-bold text-white">+</span>
                <span>
                  <span className="block text-[13px] font-semibold text-ink-soft">{t("shirtN", { n: i + 1 })}</span>
                  <span className="block text-lg font-extrabold text-ink">{t("pickAnyShirt")}</span>
                </span>
              </button>
            )}
          </li>
        ))}
      </ol>

      <fieldset className="mt-6 border-0 p-0">
        <legend className="kv-legend">{t("giftBoxLegend")}</legend>
        <label className="kv-opt w-full cursor-pointer items-start" data-pressed={giftBox}>
          <input type="checkbox" checked={giftBox} onChange={(e) => setGiftBox(e.target.checked)} className="mt-1 size-4 accent-[#1f5cff]" />
          <span>
            {t("giftBoxToggle")}
            <small className="ms-1.5 text-ink-soft">
              <Figure>+₪{GIFT_BOX_PRICE}</Figure>
            </small>
          </span>
        </label>
      </fieldset>

      <div className="mt-6 rounded-[14px] border border-rule bg-tile p-5">
        <ul className="grid gap-1.5 text-[13.5px] text-ink-soft">
          {slots.map((s, i) => (
            <li key={i} className="flex justify-between gap-4">
              <span className="min-w-0 truncate">{s.shirt ? s.shirt.title : `${t("shirtN", { n: i + 1 })} - ${t("notPicked")}`}</span>
              {priced[i] ? <Price value={priced[i]!.price} /> : <span>-</span>}
            </li>
          ))}
          {giftBox ? (
            <li className="flex justify-between gap-4">
              <span>{t("giftBoxLegend")}</span>
              <Price value={GIFT_BOX_PRICE} />
            </li>
          ) : null}
        </ul>
        <div className="mt-3 flex items-end justify-between gap-4 border-t border-rule pt-3">
          <span className="font-bold text-ink">{t("total")}</span>
          <Price value={total} className="text-[1.75rem] leading-none font-extrabold text-ink" />
        </div>
        {ready && saving > 0 ? <SaveNote save={saving} full={total + saving} t={t} /> : null}
        <p className="mt-2 text-xs text-ink-soft">{t("totalNote")}</p>
        <button type="button" onClick={onAdd} disabled={!ready} className="btn mt-4 w-full disabled:cursor-not-allowed disabled:opacity-50">
          {ready ? t("addBundle") : t("pickThree", { n: slots.filter((s) => !s.shirt).length })}
        </button>
      </div>

      {picking !== null ? (
        <ShirtPicker
          shirts={shirts}
          onPick={(shirt) => {
            update(picking, { shirt, choice: { ...slots[picking].choice, patches: [] } });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
          title={t("shirtN", { n: picking + 1 })}
        />
      ) : null}

      <div aria-live="polite">
        {added ? (
          <div className="kv-toast" role="status">
            <div className="flex items-start gap-3">
              <div className="min-w-0 grow">
                <p className="text-[14px] font-bold text-white">{t("added")}</p>
                <p className="mt-1 truncate text-[13px] text-white/80">{bundleTitle}</p>
                <p className="mt-0.5 text-[12px] text-white/60">
                  <Price value={total} />
                </p>
              </div>
              <button type="button" onClick={() => setAdded(false)} aria-label={tCommon("close")} className="grid size-7 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10">
                ×
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link href="/cart" className="rounded-[8px] border border-white/20 px-3 py-2.5 text-center text-[13px] font-semibold text-white hover:bg-white/10">
                {tp("viewCart")} (<Figure>{cartCount}</Figure>)
              </Link>
              <Link href="/checkout" className="rounded-[8px] bg-[#1f5cff] px-3 py-2.5 text-center text-[13px] font-bold text-white hover:bg-[#3a72ff]">
                {tCommon("checkout")}
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Pick one shirt: search box + team filter + a grid of every shirt that can go in the bundle. */
function ShirtPicker({ shirts, onPick, onClose, title }: { shirts: PickableShirt[]; onPick: (s: PickableShirt) => void; onClose: () => void; title: string }) {
  const t = useTranslations("bundle");
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState<string>("");

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const teams = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of shirts) if (!seen.has(s.team)) seen.set(s.team, s.teamName);
    return [...seen.entries()];
  }, [shirts]);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = shirts.filter((s) => (!team || s.team === team) && words.every((w) => s.search.includes(w)));

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      className="m-auto max-h-[88vh] w-[min(760px,94vw)] overflow-hidden rounded-[18px] bg-paper p-0 text-ink backdrop:bg-black/60"
    >
      <div className="flex max-h-[88vh] flex-col">
        <div className="border-b border-rule p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-lg font-extrabold">{title} - {t("pickAnyShirt")}</p>
            <button type="button" onClick={() => ref.current?.close()} className="grid size-8 place-items-center rounded-full text-xl hover:bg-tile" aria-label="close">×</button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchShirts")}
              className="kv-input grow"
              autoFocus
            />
            <select value={team} onChange={(e) => setTeam(e.target.value)} className="kv-input sm:w-56">
              <option value="">{t("allTeams")}</option>
              {teams.map(([slug, name]) => (
                <option key={slug} value={slug}>{name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-y-auto p-4">
          {list.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {list.map((s) => (
                <li key={s.handle}>
                  <button
                    type="button"
                    onClick={() => onPick(s)}
                    className="flex w-full flex-col gap-1.5 rounded-[12px] border-[1.5px] border-rule bg-tile p-2 text-start transition-colors hover:border-[#1f5cff]"
                  >
                    <span className="relative block aspect-square w-full overflow-hidden rounded-md">
                      <Image src={s.image} alt="" fill sizes="(max-width: 640px) 45vw, 170px" className="object-contain" />
                    </span>
                    <span className="line-clamp-2 text-[12.5px] leading-snug font-semibold">{s.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-ink-soft">{t("noShirts")}</p>
          )}
        </div>
      </div>
    </dialog>
  );
}
