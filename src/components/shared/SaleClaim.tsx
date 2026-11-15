"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { SALE, saleAmount, saleOn } from "@/lib/sale";

/**
 * "Claim your Black Friday discount?" (owner request 2026-11-15). While the dated sale runs, a visitor
 * is asked once per browser when they open the site: Yes = the code goes on their checkout by itself
 * (CheckoutView reads saleClaimed()); No = nothing happens, they type the code at checkout themselves.
 * Waits for the first-visit language picker and the home film intro, never shows on checkout pages.
 */
const KEY = (code: string) => `kv-sale-claim:${code}`;

export function saleClaimed(): boolean {
  if (!SALE) return false;
  try {
    return localStorage.getItem(KEY(SALE.code)) === "yes";
  } catch {
    return false;
  }
}

function answered(): boolean {
  if (!SALE) return true;
  try {
    return localStorage.getItem(KEY(SALE.code)) !== null;
  } catch {
    return true; // no storage: don't nag on every page
  }
}

function busy(): boolean {
  const r = document.documentElement;
  if (r.hasAttribute("data-kv-intro") || document.querySelector('.kv-vhero[data-intro="playing"]')) return true;
  if (document.querySelector("dialog[open]")) return true; // the language picker or anything else modal
  try {
    if (!localStorage.getItem("kv-lang")) return true; // the language picker hasn't been answered yet
  } catch { /* ignore */ }
  return false;
}

export function SaleClaim() {
  const t = useTranslations("promo");
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!SALE || !saleOn() || answered() || pathname.startsWith("/checkout")) return;
    let timer = 0;
    const tryOpen = () => {
      if (answered()) return;
      if (busy()) { timer = window.setTimeout(tryOpen, 700); return; }
      setShow(true);
    };
    timer = window.setTimeout(tryOpen, 1500);
    return () => window.clearTimeout(timer);
    // first mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const d = dialogRef.current;
    if (show && d && !d.open) d.showModal();
  }, [show]);

  if (!show || !SALE) return null;
  const sale = SALE;

  const answer = (yes: boolean) => {
    try { localStorage.setItem(KEY(sale.code), yes ? "yes" : "no"); } catch { /* ignore */ }
    dialogRef.current?.close();
    setShow(false);
  };
  const amount = `⁦${saleAmount(SALE)}⁩`;
  const min = `⁦₪${SALE.minOrder}⁩`;

  return (
    <dialog ref={dialogRef} className="kv-claim" aria-labelledby="kv-claim-title" onCancel={() => answer(false)}>
      <div className="kv-claim-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/home/bf/lockup.webp" alt="Black Friday" width={960} height={478} className="kv-claim-lockup" />
        <h2 id="kv-claim-title" className="kv-claim-title">{t("claimTitle", { amount })}</h2>
        <p className="kv-claim-body">
          {SALE.minOrder > 0 ? t("claimBodyMin", { amount, min }) : t("claimBody", { amount })}
        </p>
        <p className="kv-claim-code latin" dir="ltr">{SALE.code}</p>
        <div className="kv-claim-actions">
          <button type="button" className="kv-claim-yes" onClick={() => answer(true)} autoFocus>
            {t("claimYes")}
          </button>
          <button type="button" className="kv-claim-no" onClick={() => answer(false)}>
            {t("claimNo")}
          </button>
        </div>
        <p className="kv-claim-note">{t("claimNote")}</p>
      </div>
    </dialog>
  );
}
