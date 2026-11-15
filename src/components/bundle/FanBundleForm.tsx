"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ADDONS, accessoryBundlePrice, accessoryListPrice, patchesTotal, priceFor, round2 } from "@/data/pricing";
import { patchPieces } from "@/lib/patch-limits";
import { useCart } from "@/components/cart/CartProvider";
import { Figure, Price } from "@/components/shared/Money";
import { sanitizeNameNumber } from "@/lib/product";
import { OptionButton } from "@/components/product/ProductForm";
import { SaveNote, ShirtCard, START, type BundleShirt, type ShirtChoice } from "./BundleForm";

export interface FanBundleAccessory {
  handle: string;
  category: "keychain" | "scarf";
  image: string;
  label: string;
}

/**
 * The fan bundle buy box (owner request 2026-11-15): pick one of the club's three 2026/27 shirts, fan or
 * player, customise it like on the product page, plus the team's keychain and a scarf - all at the
 * bundle prices (the old shirt prices, keychain 15, scarf 45, from admin Pricing), with the saving shown
 * against buying them separately. Adding puts the shirt, the keychain and the scarf in the cart tagged
 * with the bundle's slug; the cart, checkout and the server only keep the bundle prices while all three
 * are there (completeBundles in src/data/bundle-defs.ts).
 */
export function FanBundleForm({
  slug, shirts, keychain, scarves, leagueName, bundleTitle,
}: {
  slug: string; shirts: BundleShirt[]; keychain: FanBundleAccessory; scarves: FanBundleAccessory[]; leagueName: string | null; bundleTitle: string;
}) {
  const t = useTranslations("bundle");
  const tp = useTranslations("product");
  const tCommon = useTranslations("common");
  const { add, count: cartCount } = useCart();
  const [shirtIndex, setShirtIndex] = useState(0);
  const [version, setVersion] = useState<"fan" | "player">("fan");
  const [choice, setChoice] = useState<ShirtChoice>(START);
  const [scarfIndex, setScarfIndex] = useState(0);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 8000);
    return () => window.clearTimeout(timer);
  }, [added]);

  const shirt = shirts[shirtIndex];
  const scarf = scarves[scarfIndex];
  const name = choice.personalise ? sanitizeNameNumber(choice.nameNumber).trim() : "";
  const extras = (name ? ADDONS.nameNumber : 0) + patchesTotal(patchPieces(choice.patches, false));
  const shirtPrice = round2(priceFor(shirt.season, choice.size, version, choice.sleeve, undefined, true) + extras);
  const shirtNormal = round2(priceFor(shirt.season, choice.size, version, choice.sleeve) + extras);
  const keyPrice = accessoryBundlePrice("keychain") ?? 0;
  const keyNormal = accessoryListPrice("keychain") ?? keyPrice;
  const scarfPrice = accessoryBundlePrice("scarf") ?? 0;
  const scarfNormal = accessoryListPrice("scarf") ?? scarfPrice;
  const total = round2(shirtPrice + keyPrice + scarfPrice);
  const separately = round2(shirtNormal + keyNormal + scarfNormal);

  function onAdd() {
    add({
      kind: "jersey",
      handle: shirt.handle,
      size: choice.size,
      version,
      sleeve: choice.sleeve,
      patches: choice.patches,
      qty: 1,
      ...(name ? { nameNumber: name } : {}),
      bundle: slug,
    });
    add({ kind: "accessory", handle: keychain.handle, qty: 1, bundle: slug });
    add({ kind: "accessory", handle: scarf.handle, qty: 1, bundle: slug });
    setAdded(true);
  }

  return (
    <div>
      {/* 1. which shirt */}
      <fieldset className="mb-5 border-0 p-0">
        <legend className="kv-legend">{t("pickShirt")}</legend>
        <div className="grid grid-cols-3 gap-2.5">
          {shirts.map((s, i) => (
            <button
              key={s.handle}
              type="button"
              aria-pressed={i === shirtIndex}
              onClick={() => { setShirtIndex(i); setChoice((c) => ({ ...c, patches: [] })); }}
              className={`flex flex-col items-center gap-1.5 rounded-[12px] border-[1.5px] bg-tile p-2 text-[12.5px] font-semibold transition-colors ${
                i === shirtIndex ? "border-[#1f5cff] shadow-[0_0_0_1px_#1f5cff]" : "border-rule hover:border-ink"
              }`}
            >
              <span className="relative block aspect-square w-full overflow-hidden rounded-md">
                <Image src={s.image} alt="" fill sizes="(max-width: 640px) 30vw, 160px" className="object-contain" />
              </span>
              {s.kitLabel}
            </button>
          ))}
        </div>
      </fieldset>

      {/* 2. fan or player */}
      <fieldset className="mb-5 border-0 p-0">
        <legend className="kv-legend">{tp("version")}</legend>
        <div className="flex flex-wrap gap-2">
          {(["fan", "player"] as const).map((v) => (
            <OptionButton key={v} pressed={version === v} onClick={() => setVersion(v)}>
              {v === "fan" ? tp("versionFan") : tp("versionPlayer")}
              <small className="ms-1.5 text-ink-soft">
                <Price value={priceFor(shirt.season, choice.size, v, choice.sleeve, undefined, true)} />
              </small>
            </OptionButton>
          ))}
        </div>
      </fieldset>

      <ShirtCard
        shirt={shirt}
        index={0}
        label={t("theShirt")}
        choice={choice}
        unitPrice={shirtPrice}
        leagueName={leagueName}
        onChange={(patch) => setChoice((c) => ({ ...c, ...patch }))}
        t={t}
        tp={tp}
        version={version}
      />

      {/* 3. keychain + scarf */}
      <div className="mt-5 grid gap-3">
        <ExtraRow item={keychain} title={t("keychain")} price={keyPrice} normal={keyNormal} />
        {scarves.length > 1 ? (
          <fieldset className="border-0 p-0">
            <legend className="kv-legend">{t("pickScarf")}</legend>
            <div className="flex flex-wrap gap-2">
              {scarves.map((s, i) => (
                <OptionButton key={s.handle} pressed={i === scarfIndex} onClick={() => setScarfIndex(i)}>
                  {s.label}
                </OptionButton>
              ))}
            </div>
          </fieldset>
        ) : null}
        <ExtraRow item={scarf} title={t("scarf")} price={scarfPrice} normal={scarfNormal} />
      </div>

      <div className="mt-6 rounded-[14px] border border-rule bg-tile p-5">
        <ul className="grid gap-1.5 text-[13.5px] text-ink-soft">
          <li className="flex justify-between gap-4">
            <span>{shirt.kitLabel} · {version === "fan" ? tp("versionFan") : tp("versionPlayer")}{choice.sleeve === "long" ? ` · ${tp("sleeveLong")}` : ""}</span>
            <Price value={shirtPrice} />
          </li>
          <li className="flex justify-between gap-4">
            <span>{t("keychain")}</span>
            <Price value={keyPrice} />
          </li>
          <li className="flex justify-between gap-4">
            <span>{t("scarf")}</span>
            <Price value={scarfPrice} />
          </li>
        </ul>
        <div className="mt-3 flex items-end justify-between gap-4 border-t border-rule pt-3">
          <span className="font-bold text-ink">{t("total")}</span>
          <Price value={total} className="text-[1.75rem] leading-none font-extrabold text-ink" />
        </div>
        {separately > total ? <SaveNote save={separately - total} full={separately} t={t} /> : null}
        <p className="mt-2 text-xs text-ink-soft">{t("totalNote")}</p>
        <button type="button" onClick={onAdd} className="btn mt-4 w-full">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M3.2 5.5h9.6l-.8 8.3H4z" strokeLinejoin="round" />
            <path d="M6 7.2V4.8a2 2 0 0 1 4 0v2.4" strokeLinecap="round" />
          </svg>
          {t("addBundle")}
        </button>
      </div>

      <div aria-live="polite">
        {added ? (
          <div className="kv-toast" role="status">
            <p className="text-[14px] font-bold text-white">{t("added")}</p>
            <p className="mt-1 truncate text-[13px] text-white/80">{bundleTitle}</p>
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

function ExtraRow({ item, title, price, normal }: { item: FanBundleAccessory; title: string; price: number; normal: number }) {
  return (
    <div className="kv-panel flex items-center gap-3 !p-3">
      <span className="relative block size-14 shrink-0 overflow-hidden rounded-[10px] bg-tile">
        <Image src={item.image} alt="" fill sizes="56px" className="object-contain" />
      </span>
      <div className="min-w-0 grow">
        <p className="mono-eyebrow text-ink-soft">{title}</p>
        <p className="truncate font-bold text-ink">{item.label}</p>
      </div>
      <span className="shrink-0 text-end">
        {normal > price ? (
          <s className="block text-[12px] text-ink-soft">
            <Price value={normal} />
          </s>
        ) : null}
        <Price value={price} className="text-lg font-extrabold text-ink" />
      </span>
    </div>
  );
}
