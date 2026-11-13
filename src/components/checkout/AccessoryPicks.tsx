"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Check, Plus, X } from "lucide-react";
import { useCart } from "@/components/cart/CartProvider";
import type { CartAccessoryInfo } from "@/components/cart/CartView";
import { accessoryLabel } from "@/components/shop/accessoryLabel";
import { Price } from "@/components/shared/Money";
import { pickAccessories } from "@/lib/accessory-picks";

/**
 * Accessory suggestions at checkout (owner request 2026-11-13): the scarf + keychain of the teams in
 * the cart (`pickAccessories`). Shown twice:
 *  - a pop-up a moment after checkout opens - once per browser session for the same set of teams,
 *    so it never nags (sessionStorage; if storage is blocked it just shows once per page load);
 *  - a small strip in the order summary, for whatever is still not in the cart after that.
 * "Add" puts one on the cart like any accessory line; the server prices it as usual.
 */

const SEEN_KEY = "kv-picks-seen";
const POPUP_DELAY_MS = 700;
const POPUP_COLS: Record<number, string> = { 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" };

type Props = {
  shirts: { team?: string; qty: number }[];
  accessories: CartAccessoryInfo[];
  inCart: CartAccessoryInfo[];
  locale: string;
};

export function AccessoryPicks({ shirts, accessories, inCart, locale }: Props) {
  const t = useTranslations("checkout");
  const tAccessories = useTranslations("accessories");
  const { add } = useCart();
  const picks = pickAccessories(shirts, accessories, inCart);
  const added = new Set(inCart.map((a) => a.handle));

  // ---- pop-up ----
  const dialogRef = useRef<HTMLDialogElement>(null);
  // the list the pop-up opened with, so an added pick turns into "Added" instead of vanishing
  const [popupPicks, setPopupPicks] = useState<CartAccessoryInfo[] | null>(null);
  const signature = picks.map((p) => p.handle).join(",");
  const teamsKey = [...new Set(shirts.map((s) => s.team ?? ""))].sort().join("|");

  useEffect(() => {
    if (!signature || popupPicks) return;
    let seen: string | null = null;
    try {
      seen = sessionStorage.getItem(SEEN_KEY);
    } catch {}
    if (seen === teamsKey) return;
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(SEEN_KEY, teamsKey);
      } catch {}
      setPopupPicks(picks);
    }, POPUP_DELAY_MS);
    return () => window.clearTimeout(timer);
    // picks is derived from signature; re-running on its identity would restart the timer every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, teamsKey, popupPicks]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (popupPicks && dialog && !dialog.open) dialog.showModal();
  }, [popupPicks]);

  const close = () => dialogRef.current?.close();

  const card = (accessory: CartAccessoryInfo, big: boolean) => {
    const label = accessoryLabel(tAccessories, accessory, locale);
    const isAdded = added.has(accessory.handle);
    return (
      <li
        key={accessory.handle}
        className={big
          ? "grid grid-cols-[72px_1fr] items-center gap-x-3 rounded-[12px] border border-rule bg-white p-2.5 sm:flex sm:flex-col sm:items-stretch"
          : "grid grid-cols-[56px_1fr] items-center gap-x-3 rounded-[12px] border border-rule bg-white p-2"}
      >
        <span className={`grid aspect-square place-items-center overflow-hidden rounded-[8px] bg-[#f1f3f7] row-span-2 ${big ? "sm:mb-2" : ""}`}>
          <Image
            src={accessory.image}
            alt={label}
            width={240}
            height={240}
            sizes={big ? "(min-width: 640px) 160px, 72px" : "56px"}
            className="h-auto w-[86%] mix-blend-multiply"
          />
        </span>
        <span className={`line-clamp-2 leading-tight text-ink ${big ? "self-end text-[13px] sm:min-h-[2.5em] sm:self-auto sm:text-[12.5px]" : "self-end text-[12.5px]"}`}>{label}</span>
        <span className={`flex items-center justify-between gap-2 ${big ? "mt-1.5 self-start sm:mt-2 sm:self-auto" : "mt-1 self-start"}`}>
          <span className="text-[13px] font-bold text-ink">
            <Price value={accessory.price} />
          </span>
          {isAdded ? (
            <span className="inline-flex h-8 items-center gap-1 rounded-full bg-[#e7f6ec] px-3 text-[12.5px] font-semibold text-[#17803d]" role="status">
              <Check className="size-3.5" aria-hidden />
              {t("picksAdded")}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => add({ kind: "accessory", handle: accessory.handle, qty: 1 })}
              aria-label={t("picksAddLabel", { item: label })}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-[#1f5cff] px-3 text-[12.5px] font-semibold text-white transition hover:bg-[#1748d6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f5cff]"
            >
              <Plus className="size-3.5" aria-hidden />
              {t("picksAdd")}
            </button>
          )}
        </span>
      </li>
    );
  };

  return (
    <>
      {picks.length > 0 ? (
        <div className="border-b border-rule py-5">
          <p className="kv-legend">{t("picksTitle")}</p>
          <p className="mb-3 text-xs text-ink-soft">{t("picksHint")}</p>
          <ul className="grid gap-2">{picks.map((a) => card(a, false))}</ul>
        </div>
      ) : null}

      {popupPicks ? (
        <dialog
          ref={dialogRef}
          aria-labelledby="kv-picks-title"
          onClick={(event) => {
            // a click on the backdrop (the dialog box itself, outside the panel) closes it
            if (event.target === event.currentTarget) close();
          }}
          className="m-0 mt-auto max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-[#0a1024]/60 backdrop:backdrop-blur-[2px] sm:m-auto sm:max-w-[40rem]"
        >
          <div className="max-h-[88dvh] overflow-y-auto rounded-t-[22px] bg-[#f7f8fb] p-5 shadow-2xl sm:rounded-[22px] sm:p-6">
            <div className="mb-1 flex items-start justify-between gap-4">
              <h2 id="kv-picks-title" className="text-[19px] font-bold text-ink">
                {t("picksPopupTitle")}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={t("picksClose")}
                className="-m-1.5 grid size-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-black/5"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <p className="mb-4 text-[13px] text-ink-soft">{t("picksPopupHint")}</p>
            <ul className={`grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5 ${POPUP_COLS[popupPicks.length] ?? ""}`}>
              {popupPicks.map((a) => card(a, true))}
            </ul>
            <button type="button" onClick={close} className="btn mt-5 w-full justify-center">
              {t("picksContinue")}
            </button>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
