"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { BitMark } from "@/components/checkout/BitMark";
import { MAX_PROOF_BYTES, type ManualMethod, type ManualPayState } from "@/lib/manual-pay-core";

export type ManualPayPanelView = {
  number: number;
  method: ManualMethod;
  totalLabel: string;
  note: string;
  state: ManualPayState;
  reviewNote: string | null;
  reportedReference: string | null;
  reportedProof: boolean;
  bit: { phone: string; phoneLabel: string; name: string | null } | null;
  paypalUrl: string | null;
  methodUnavailable: boolean;
};

// Bit's official store listings: there is no public link that opens personal Bit with a payee and amount,
// so "Open Bit" opens the app's own store page (which shows "Open" when Bit is installed).
const BIT_IOS = "https://apps.apple.com/il/app/bit/id1182007739";
const BIT_ANDROID = "https://play.google.com/store/apps/details?id=com.bnhp.payments.paymentsapp";

const noSubscribe = () => () => {};
function detectPlatform(): "ios" | "android" | "other" {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : /Android/i.test(ua) ? "android" : "other";
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useTranslations("manualPay");
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // older browsers: select-and-copy fallback
      const el = document.createElement("textarea");
      el.value = value;
      el.setAttribute("readonly", "");
      el.style.position = "absolute";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      try { document.execCommand("copy"); } catch { /* nothing more to try */ }
      el.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  }
  return (
    <button type="button" onClick={copy} className="btn btn-quiet shrink-0 !px-3 !py-1.5 text-xs" aria-label={`${t("copy")} ${label}`}>
      <span aria-live="polite">{done ? t("copied") : t("copy")}</span>
    </button>
  );
}

function Field({ label, value, copyValue, ltr = true }: { label: string; value: string; copyValue: string; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-rule py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-xs text-ink-soft">{label}</p>
        <bdi dir={ltr ? "ltr" : "auto"} className="latin tabular block truncate text-lg font-extrabold">{value}</bdi>
      </div>
      <CopyButton value={copyValue} label={label} />
    </div>
  );
}

export function ManualPayPanel({ token, view }: { token: string; view: ManualPayPanelView }) {
  const t = useTranslations("manualPay");
  const router = useRouter();
  const isBit = view.method === "bit_personal";
  // which phone the customer is on, for the "Open Bit" button (null on the server render: no user agent there)
  const platform = useSyncExternalStore(noSubscribe, detectPlatform, () => null);

  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sent = useRef(false);

  async function report(e: React.FormEvent) {
    e.preventDefault();
    if (sending || sent.current) return;
    setError(null);
    if (!reference.trim() && !file) return setError(t("errorEmpty"));
    if (file && file.size > MAX_PROOF_BYTES) return setError(t("errorTooLarge"));
    setSending(true);
    const fd = new FormData();
    fd.set("t", token);
    fd.set("reference", reference);
    if (file) fd.set("proof", file);
    try {
      const res = await fetch("/api/checkout/manual/report", { method: "POST", body: fd });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; code?: string } | null;
      if (res.ok && body?.ok) {
        sent.current = true;
        router.refresh();
        return;
      }
      const code = body?.code;
      if (code === "already_reported" || code === "closed") {
        sent.current = true;
        router.refresh();
        return;
      }
      setError(code === "too_large" ? t("errorTooLarge") : code === "not_image" ? t("errorNotImage") : code === "empty" ? t("errorEmpty") : t("errorGeneric"));
    } catch {
      setError(t("errorGeneric"));
    }
    setSending(false);
  }

  const [cancelling, setCancelling] = useState(false);
  async function cancelOrder() {
    if (!confirm(t("cancelConfirm"))) return;
    setCancelling(true);
    try {
      await fetch("/api/checkout/manual/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token }) });
    } catch {
      // the refresh below shows whatever the order's real state is
    }
    router.refresh();
    setCancelling(false);
  }

  const orderLink = `/o/${token}`;

  if (view.state === "paid") {
    return (
      <div className="mx-auto w-full max-w-[640px] py-8 flex flex-col gap-4">
        <StatusNote tone="ok">{t("paidBody")}</StatusNote>
        <div className="flex flex-wrap gap-3">
          <a href={orderLink} className="btn">{t("viewOrder")}</a>
          <Link href="/shop" className="btn btn-quiet">{t("keepShopping")}</Link>
        </div>
      </div>
    );
  }
  if (view.state === "failed" || view.state === "cancelled") {
    return (
      <div className="mx-auto w-full max-w-[640px] py-8 flex flex-col gap-4">
        <StatusNote tone="bad">{view.state === "failed" ? t("failedBody") : t("cancelledBody")}</StatusNote>
        {view.state === "failed" && view.reviewNote ? <p className="text-sm text-ink-soft" dir="auto">{view.reviewNote}</p> : null}
        <div className="flex flex-wrap gap-3">
          <Link href="/contact" className="btn btn-quiet">{t("contactUs")}</Link>
          <Link href="/shop" className="btn">{t("keepShopping")}</Link>
        </div>
      </div>
    );
  }
  if (view.state === "awaiting_verification") {
    return (
      <div className="mx-auto w-full max-w-[640px] py-8 flex flex-col gap-4">
        <StatusNote tone="wait">{t(isBit ? "verifyingBodyBit" : "verifyingBodyPayPal", { amount: view.totalLabel })}</StatusNote>
        <div className="rounded-[12px] border border-rule p-4 text-sm">
          <p className="text-ink-soft">{t("youSent")}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {view.reportedReference ? <li>{t("referenceSent")}: <bdi dir="ltr" className="latin font-semibold">{view.reportedReference}</bdi></li> : null}
            {view.reportedProof ? <li>{t("screenshotSent")}</li> : null}
          </ul>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href={orderLink} className="btn">{t("viewOrder")}</a>
          <Link href="/shop" className="btn btn-quiet">{t("keepShopping")}</Link>
        </div>
      </div>
    );
  }

  // awaiting_payment / needs_resubmit
  return (
    <div className="mx-auto w-full max-w-[640px] py-8 flex flex-col gap-5">
      {view.state === "needs_resubmit" ? (
        <StatusNote tone="wait">
          {t("resubmitBody")}
          {view.reviewNote ? <span className="mt-1 block font-semibold" dir="auto">{view.reviewNote}</span> : null}
        </StatusNote>
      ) : (
        <StatusNote tone="info">{t("notPaidYet")}</StatusNote>
      )}

      {view.methodUnavailable || (isBit ? !view.bit : !view.paypalUrl) ? (
        <StatusNote tone="bad">{t("methodUnavailable")}</StatusNote>
      ) : (
        <section className="rounded-[12px] border border-rule p-4 sm:p-5">
          <h3 className="kv-filter-head mb-2 flex items-center !justify-start gap-3">
            <span className="grid size-7 place-items-center rounded-full bg-[#1f5cff] text-[13px] text-white">1</span>
            {isBit ? t("stepPayBit") : t("stepPayPayPal")}
          </h3>
          <div className="mb-3">
            <Field label={t("amount")} value={`₪${view.totalLabel}`} copyValue={view.totalLabel} />
            {isBit && view.bit ? (
              <Field label={view.bit.name ? t("bitNumberTo", { name: view.bit.name }) : t("bitNumber")} value={view.bit.phoneLabel} copyValue={view.bit.phone} />
            ) : null}
            <Field label={t("noteLabel")} value={view.note} copyValue={view.note} />
          </div>

          {isBit ? (
            <>
              <ol className="mb-4 list-decimal ps-5 text-sm text-ink-soft [&>li]:mt-1">
                <li>{t("bitStep1")}</li>
                <li>{t("bitStep2", { amount: view.totalLabel })}</li>
                <li>{t("bitStep3", { note: view.note })}</li>
                <li>{t("bitStep4")}</li>
              </ol>
              {platform === "ios" || platform === "android" ? (
                <a href={platform === "ios" ? BIT_IOS : BIT_ANDROID} target="_blank" rel="noopener noreferrer" className="btn w-full gap-2.5">
                  <BitMark className="h-5" />
                  {t("openBit")}
                </a>
              ) : platform === "other" ? (
                <p className="rounded-[10px] bg-chip px-3.5 py-3 text-sm">{t("openBitDesktop")}</p>
              ) : null}
              <p className="mt-2 text-xs text-ink-soft">{t("openBitNote")}</p>
            </>
          ) : (
            <>
              <ol className="mb-4 list-decimal ps-5 text-sm text-ink-soft [&>li]:mt-1">
                <li>{t("ppStep1", { amount: view.totalLabel })}</li>
                <li>{t("ppStep2", { note: view.note })}</li>
                <li>{t("ppStep3")}</li>
              </ol>
              <a href={view.paypalUrl!} target="_blank" rel="noopener noreferrer" className="btn w-full">
                {t("payWithPayPal")}
              </a>
              <p className="mt-2 text-xs text-ink-soft">{t("ppNote")}</p>
            </>
          )}
        </section>
      )}

      <section className="rounded-[12px] border border-rule p-4 sm:p-5">
        <h3 className="kv-filter-head mb-2 flex items-center !justify-start gap-3">
          <span className="grid size-7 place-items-center rounded-full bg-[#1f5cff] text-[13px] text-white">2</span>
          {t("stepReport")}
        </h3>
        <p className="mb-4 text-sm text-ink-soft">{t("reportIntro")}</p>
        <form onSubmit={report} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {isBit ? t("referenceBit") : t("referencePayPal")}
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={80}
              dir="ltr"
              autoComplete="off"
              className="kv-input latin font-normal"
            />
          </label>
          <div className="flex flex-col gap-1.5 text-sm font-semibold">
            <span>{t("screenshot")}</span>
            {/* the browser's own file control can't be translated - a localized button over a hidden input */}
            <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border-[1.5px] border-dashed border-rule px-3.5 py-3 font-normal focus-within:border-[#1f5cff]">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="sr-only"
              />
              <span className="btn btn-quiet pointer-events-none shrink-0 !px-3 !py-1.5 text-xs">{file ? t("changeFile") : t("chooseFile")}</span>
              <span className="min-w-0 truncate text-sm text-ink-soft" dir="auto">{file ? file.name : t("noFile")}</span>
            </label>
            <span className="text-xs font-normal text-ink-soft">{t("screenshotHint")}</span>
          </div>
          <button type="submit" className="btn w-full" disabled={sending}>
            {sending ? t("sending") : t("reportButton")}
          </button>
          <p aria-live="polite" className="min-h-5 text-sm font-semibold text-[#c0392b]">{error}</p>
        </form>
      </section>

      <p className="text-xs text-ink-soft">
        {t("notChargedNote")}{" "}
        {view.state === "awaiting_payment" ? (
          <button type="button" onClick={cancelOrder} disabled={cancelling} className="font-semibold text-[#1f5cff] underline-offset-4 hover:underline">
            {t("cancelOrder")}
          </button>
        ) : null}
      </p>
    </div>
  );
}

function StatusNote({ tone, children }: { tone: "ok" | "wait" | "bad" | "info"; children: React.ReactNode }) {
  const cls = {
    ok: "border-[#9ad3a8] bg-[#eefaf1] text-[#1d5b2c]",
    wait: "border-[#f0c36d] bg-[#fff8e6] text-[#5c4100]",
    bad: "border-[#f0b1aa] bg-[#fdf0ee] text-[#7a2318]",
    info: "border-rule bg-chip text-ink",
  }[tone];
  return (
    <p role="status" className={`rounded-[10px] border px-4 py-3.5 text-sm ${cls}`}>
      {children}
    </p>
  );
}
