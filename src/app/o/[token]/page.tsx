/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { Banknote, CreditCard, MessageCircle, Truck, ShieldCheck, Check, Smartphone } from "lucide-react";
import { db } from "@/lib/db";
import { readOrderToken } from "@/lib/orders/link";
import { PATCHES, type PatchId } from "@/lib/orders/rules";
import { getAccessory } from "@/data/accessories";
import { TOWN_OPTIONS } from "@/data/localities";
import { estimatedArrival } from "@/lib/orders/eta";
import { CUSTOMER_STAGES, customerStage } from "@/lib/orders/customer-stage";
import { PATCH_PROP_KEYS } from "@/data/patches";
import heMessages from "@/i18n/messages/he.json";
import enMessages from "@/i18n/messages/en.json";
import { DIR, dateLabel, dayLabel, oLang, strings, type OLang } from "./strings";

export const dynamic = "force-dynamic";

type QuoteLine = { key: string; qty: number; title: string; unitPrice: number; groupPrice: number; lineTotal: number; offerId?: string | null; addons: { id: string; label: string; amount: number }[] };
type Quote = {
  lines: QuoteLine[]; itemsTotal: number; total: number; discountTotal: number; paymentFee?: number;
  offer?: { label: string; saving: number } | null;
  delivery?: { fee: number; days: string; label: string; zoneId?: string } | null;
  orderAddons?: { id?: string; label: string; amount: number }[];
};
type Item = { id: string; product_id: string | null; description: string | null; version: string; sleeve: string; size: string; qty: number; print_name: string | null; print_number: string | null; patches: string[] };
type Product = { id: string; title_ar: string | null; title_en: string; title_he: string | null; primary_image_url: string | null; photo_status: string | null };

const ils = (agorot: number) => `${(agorot / 100).toLocaleString("en-US")}₪`;

// customer's view of the order lifecycle: the owner's day-by-day timeline (2026-11-23,
// src/lib/orders/customer-stage.ts) - labels per language in ./strings.ts (`t.steps`, same order as CUSTOMER_STAGES)
const PATCH_NAMES: Record<Exclude<OLang, "ar">, Record<string, string>> = { he: heMessages.cart as Record<string, string>, en: enMessages.cart as Record<string, string> };
function patchName(id: string, lang: OLang): string {
  if (lang !== "ar") { const key = PATCH_PROP_KEYS[id as PatchId]; const v = key ? PATCH_NAMES[lang][key] : undefined; if (v && !v.includes("{")) return v; }
  return PATCHES[id as PatchId]?.label_ar ?? id;
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ l?: string }> }) {
  return { title: strings(oLang((await searchParams).l)).title };
}

export default async function OrderPage({ params, searchParams }: PageProps<"/o/[token]">) {
  const { token } = await params;
  const lParam = (await searchParams).l;
  const id = readOrderToken(token);
  if (!id) notFound();
  const o = (await db().from("orders").select("id,number,status,source,total,payment_method,payment_status,address,quote,confirmed_at,created_at,customer_id").eq("id", id).maybeSingle()).data as
    { id: string; number: number; status: string; source: string | null; total: number; payment_method: string | null; payment_status: string; address: Record<string, string | null> | null; quote: Quote | null; confirmed_at: string | null; created_at: string; customer_id: string } | null;
  if (!o || o.status === "cancelled") notFound();
  // language: the link's ?l= (the owner's WhatsApp message sets it), else the language they checked out in
  const lang: OLang = lParam ? oLang(lParam)
    : oLang((await db().from("customers").select("preferred_language").eq("id", o.customer_id).maybeSingle()).data?.preferred_language);
  const t = strings(lang);

  const items = ((await db().from("order_items").select("id,product_id,description,version,sleeve,size,qty,print_name,print_number,patches").eq("order_id", o.id).order("created_at")).data ?? []) as Item[];
  const pids = [...new Set(items.map((i) => i.product_id).filter(Boolean))] as string[];
  const products = pids.length ? ((await db().from("products").select("id,title_ar,title_en,title_he,primary_image_url,photo_status").in("id", pids)).data ?? []) as Product[] : [];
  const q = o.quote;
  // keychains / scarves on the order (owner request 2026-11-10), named in Arabic from the accessories catalogue
  const accessories = (((await db().from("order_accessories").select("handle,category,title,qty,model").eq("order_id", o.id).order("created_at")).data ?? []) as { handle: string; category: string; title: string; qty: number; model: string | null }[])
    .map((x) => {
      const a = getAccessory(x.handle);
      const team = a ? (lang === "ar" ? a.teamAr : lang === "he" ? a.teamHe || a.team : a.team) : "";
      const variant = a ? (lang === "ar" ? a.variantAr : lang === "he" ? a.variantHe || a.variant : a.variant) : null;
      const name = a ? (x.category === "scarf" ? `${t.scarf} ${team}${variant ? ` · ${variant}` : ""}` : x.category === "phone_case" ? `${t.phoneCase} ${team}${variant ? ` · ${variant}` : ""}${x.model ? ` · ${x.model}` : ""}` : `${t.keychain} ${team}`) : x.title;
      return { ...x, name, image: a?.image ?? null };
    });
  // owner 2026-11-22: a Hebrew (or English) order page is all in that language - the stored quote's
  // labels and the town are Arabic, so name them here (an owner-typed custom line keeps its own text)
  const addonLabel = (a: { id?: string; label: string }) => {
    const qty = a.label.match(/ ×\d+$/)?.[0] ?? "";
    const base = a.id === "gift_box" ? t.giftBox : a.id === "keychain" ? t.keychain : a.id === "scarf" ? t.scarf : a.id === "phone_case" ? t.phoneCase : null;
    return base ? base + qty : a.label;
  };
  const townName = (town: string | null) => {
    if (!town || lang === "ar") return town;
    const hit = TOWN_OPTIONS.find((x) => x.ar === town);
    return hit ? (lang === "he" ? hit.he : hit.en) : town;
  };
  const stage = customerStage({ status: o.status, confirmedAt: o.confirmed_at ?? o.created_at });
  const confirmed = stage !== null;
  // Website orders wait for the OWNER's OK, not the customer's — a different message than the
  // bot's "confirm with us in chat" line, which is only ever shown to an Instagram customer.
  const pendingOwnerApproval = !confirmed && o.status === "awaiting_confirmation" && o.source === "website";
  const stepIndex = stage ? CUSTOMER_STAGES.indexOf(stage) : -1;
  const paypalReady = !!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET;
  const names = items.filter((i) => i.print_name || i.print_number).length;
  const nameAddon = q?.lines.flatMap((l) => l.addons).filter((a) => a.id === "name_number").reduce((s, a) => s + a.amount, 0) ?? 0;
  const otherAddons = q?.lines.flatMap((l) => l.addons).filter((a) => a.id !== "name_number").reduce((s, a) => s + a.amount, 0) ?? 0;
  const shirtsOnly = (q?.itemsTotal ?? 0) - nameAddon - otherAddons;
  // estimated arrival (owner request 2026-11-13): a date, not "10-20 days"; out for delivery counts from when it went out
  const outForDeliveryAt = o.status === "with_courier"
    ? ((await db().from("order_events").select("created_at").eq("order_id", o.id).eq("to_status", "with_courier").order("created_at", { ascending: false }).limit(1).maybeSingle()).data?.created_at as string | undefined) ?? null
    : null;
  const eta = estimatedArrival({ status: o.status, confirmedAt: o.confirmed_at ?? o.created_at, outForDeliveryAt });
  const date = dateLabel(lang, o.confirmed_at ?? o.created_at);

  return (
    <main dir={DIR[lang]} lang={lang} className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-12 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <span dir="ltr" className="text-[20px] font-black uppercase leading-none tracking-[-0.04em]">Kitverse</span>
        <span dir="ltr" className="font-mono text-sm text-muted">#{o.number}</span>
      </header>

      <section className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-bold leading-tight">{confirmed ? t.hYours : pendingOwnerApproval ? t.hReceived : t.hSummary}</h1>
        <p className="text-sm text-muted">
          {confirmed
            ? o.status === "delivered" ? `${t.confirmedOn(date)} · ${t.delivered}` : t.confirmedOn(date)
            : pendingOwnerApproval
              ? t.reviewing
              : t.confirmInChat}
        </p>
      </section>

      {confirmed ? (
        <>
        {eta ? (
          <div className="rounded-xl bg-pitch/[0.06] px-4 py-3 ring-1 ring-pitch/15">
            {stepIndex >= 0 ? <div className="text-[13px] font-semibold text-pitch">{t.steps[stepIndex].line}</div> : null}
            <div className="mt-1 text-xs text-muted">{t.eta}</div>
            <div className="text-[17px] font-bold">
              {eta.kind === "window" ? (eta.from === eta.to ? dayLabel(lang, eta.from) : `${dayLabel(lang, eta.from)} – ${dayLabel(lang, eta.to)}`) : t.soon}
            </div>
          </div>
        ) : null}
        <ol className="grid grid-cols-7 gap-1" aria-label={t.statusAria}>
          {CUSTOMER_STAGES.map((s, i) => {
            const done = i <= stepIndex;
            return (
              <li key={s} className="flex flex-col gap-1.5">
                <span className={`h-1.5 rounded-full ${done ? "bg-pitch" : "bg-line-2"}`} />
                <span className={`text-[11px] leading-tight ${i === stepIndex ? "font-semibold text-pitch" : done ? "text-ink-2" : "text-muted"}`}>
                  {done && i < stepIndex ? <Check className="inline h-3 w-3 align-[-2px]" /> : null}{t.steps[i].label}
                </span>
              </li>
            );
          })}
        </ol>
        </>
      ) : null}

      <section className="flex flex-col divide-y divide-line border-y border-line">
        {items.map((it) => {
          const p = products.find((x) => x.id === it.product_id);
          const line = q?.lines.find((l) => l.key === it.id);
          const img = p?.photo_status === "good" || p?.photo_status === "owner_upload" ? p.primary_image_url : null;
          const printed = it.print_name || it.print_number;
          return (
            <article key={it.id} className="flex gap-3 py-4">
              <div className="grid h-[84px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-md bg-white ring-1 ring-line">
                {img ? <img src={img} alt="" className="h-full w-full object-contain" /> : <span className="text-2xl text-line-2">👕</span>}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-[15px] font-semibold leading-snug">{(lang === "ar" ? p?.title_ar : lang === "he" ? p?.title_he ?? p?.title_en : p?.title_en) ?? it.description ?? p?.title_en}</h2>
                  {line ? (
                    <div className="shrink-0 text-left tabular-nums">
                      <div className="text-[15px] font-semibold">{ils(line.unitPrice * line.qty)}</div>
                      {line.offerId && line.groupPrice > line.unitPrice ? <div className="text-xs text-muted line-through">{ils(line.groupPrice * line.qty)}</div> : null}
                    </div>
                  ) : null}
                </div>
                <div className="text-[13px] text-ink-2">
                  {it.version === "player" ? t.player : t.fan} · {it.sleeve === "long" ? t.long : t.short} · {t.size} <span dir="ltr" className="font-semibold">{it.size}</span>{it.qty > 1 ? ` · ×${it.qty}` : ""}
                </div>
                {printed ? (
                  <div className="flex items-center gap-2">
                    <span dir="ltr" className="inline-flex items-baseline gap-1.5 rounded bg-ink px-2 py-0.5 font-mono text-[12px] uppercase tracking-[0.12em] text-paper">
                      {it.print_name}<b className="text-[14px] tracking-normal">{it.print_number}</b>
                    </span>
                    <span className="text-xs text-muted">{t.printBack}</span>
                  </div>
                ) : null}
                {it.patches.length ? <div className="text-xs text-muted">{it.patches.map((x) => patchName(x, lang)).join(" + ")}</div> : null}
              </div>
            </article>
          );
        })}
        {accessories.map((x) => (
          <article key={`${x.handle}|${x.model ?? ""}`} className="flex items-center gap-3 py-4">
            <div className="grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-md bg-white ring-1 ring-line">
              {x.image ? <img src={x.image} alt="" className="h-full w-full object-contain" /> : null}
            </div>
            <h2 className="flex-1 text-[15px] font-semibold leading-snug">{x.name}{x.qty > 1 ? <span className="text-ink-2"> ×{x.qty}</span> : null}</h2>
          </article>
        ))}
      </section>

      {q ? (
        <section className="flex flex-col gap-2.5 text-[15px]">
          <Row label={t.shirts(items.reduce((s, i) => s + i.qty, 0))} value={ils(shirtsOnly + (q.offer?.saving ?? 0))} />
          {q.offer?.saving ? <Row label={t.offer3} value={`-${ils(q.offer.saving)}`} tone="green" /> : null}
          {nameAddon ? <Row label={t.nameNumber(names)} value={ils(nameAddon)} /> : null}
          {otherAddons ? <Row label={t.patches} value={ils(otherAddons)} /> : null}
          {(q.orderAddons ?? []).map((a) => <Row key={a.id ?? a.label} label={addonLabel(a)} value={ils(a.amount)} />)}
          {q.discountTotal ? <Row label={t.discount} value={`-${ils(q.discountTotal)}`} tone="green" /> : null}
          <Row label={q.delivery ? `${t.delivery} · ${q.delivery.zoneId ? (q.delivery.zoneId === "north" ? t.zoneNorth : t.zoneRest) : q.delivery.label}` : t.delivery} value={q.delivery ? ils(q.delivery.fee) : "—"} />
          {q.paymentFee ? <Row label={t.paypalFee} value={ils(q.paymentFee)} /> : null}
          <div className="mt-1 flex items-end justify-between border-t border-ink pt-3">
            <span className="font-semibold">{t.total}</span>
            <span className="flex flex-col items-end">
              <span dir="ltr" className="text-[30px] font-bold leading-none tabular-nums">{ils(o.total)}</span>
              <span className="mt-1 text-xs text-muted">{t.toDoor}</span>
            </span>
          </div>
        </section>
      ) : null}

      {o.address?.full_name || o.address?.town ? (
        <section className="flex items-start gap-3 rounded-md bg-surface p-4 ring-1 ring-line">
          <Truck className="mt-0.5 h-5 w-5 shrink-0 text-pitch" strokeWidth={1.75} />
          <div className="text-sm">
            <div className="font-semibold">{o.address.full_name}</div>
            <div className="text-ink-2">{townName(o.address.town)} · {t.courierCalls}</div>
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-2.5">
        <h2 className="text-sm font-semibold text-ink-2">{t.payMethod}</h2>
        {o.payment_method === "bit_personal" || o.payment_method === "paypal_me" ? (
          // personal Bit / PayPal.Me (owner requests 2026-11-10): paid only once the owner confirms it
          <>
            <PayOption icon={o.payment_method === "bit_personal" ? Smartphone : CreditCard} title={o.payment_method === "bit_personal" ? "Bit" : "PayPal"} selected
              text={o.payment_status === "paid" ? t.manualPaid : o.status === "awaiting_payment_verification" ? t.manualReported : t.manualUnpaid} />
            {o.payment_status !== "paid" ? <a href={`/checkout/pay?t=${encodeURIComponent(token)}`} className="text-sm font-semibold text-pitch underline-offset-4 hover:underline">{t.payDetails}</a> : null}
          </>
        ) : o.payment_method === "bit"
          ? <PayOption icon={Smartphone} title="Bit" text={o.payment_status === "paid" ? t.bitPaid : t.bitPay} selected />
          : <PayOption icon={Banknote} title={t.cash} text={t.cashText} selected={o.payment_method !== "paypal"} />}
        {o.payment_method === "bit_personal" || o.payment_method === "paypal_me" ? null : <PayOption icon={CreditCard} title={t.paypalTitle} text={o.payment_method === "paypal" && o.payment_status === "paid" ? t.paypalPaid : paypalReady ? t.paypalNow : t.soonFeature} selected={o.payment_method === "paypal"} disabled={!paypalReady && o.payment_method !== "paypal"} />}
        {o.payment_status === "paid" ? <p className="flex items-center gap-1.5 text-sm font-medium text-pitch"><Check className="h-4 w-4" /> {t.paidThanks}</p> : null}
      </section>

      <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
        {t.returns}
      </p>

      <a href="https://ig.me/m/kitversejerseys" className="flex items-center justify-center gap-2 rounded-md bg-pitch-fill py-3.5 text-[15px] font-semibold text-white active:scale-[.99]">
        <MessageCircle className="h-5 w-5" strokeWidth={1.75} /> {t.askUs}
      </a>
      <footer className="flex justify-center gap-3 text-xs text-muted"><span dir="ltr">@kitversejerseys</span>{ }
        <a href={lang === "ar" ? "/privacy" : `/${lang}/privacy`} className="underline">{t.privacy}</a></footer>
    </main>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "green" }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${tone === "green" ? "text-pitch" : ""}`}>
      <span className={tone === "green" ? "" : "text-ink-2"}>{label}</span>
      <span dir="ltr" className="tabular-nums">{value}</span>
    </div>
  );
}

function PayOption({ icon: Icon, title, text, selected, disabled }: { icon: typeof Banknote; title: string; text: string; selected: boolean; disabled?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-md p-3.5 ring-1 ${selected ? "bg-surface ring-2 ring-pitch" : "ring-line"} ${disabled ? "opacity-55" : ""}`}>
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ring-1 ${selected ? "bg-pitch ring-pitch" : "ring-line-2"}`}>{selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{title}</div>
        <div className="text-xs text-muted">{text}</div>
      </div>
      <Icon className="h-5 w-5 shrink-0 text-muted" strokeWidth={1.75} />
    </div>
  );
}
