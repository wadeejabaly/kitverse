/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { Banknote, CreditCard, MessageCircle, Truck, ShieldCheck, Check } from "lucide-react";
import { db } from "@/lib/db";
import { readOrderToken } from "@/lib/orders/link";
import { PATCHES, type PatchId } from "@/lib/orders/rules";

export const dynamic = "force-dynamic";

type QuoteLine = { key: string; qty: number; title: string; unitPrice: number; groupPrice: number; lineTotal: number; offerId?: string | null; addons: { id: string; label: string; amount: number }[] };
type Quote = {
  lines: QuoteLine[]; itemsTotal: number; total: number; discountTotal: number;
  offer?: { label: string; saving: number } | null;
  delivery?: { fee: number; days: string; label: string } | null;
  orderAddons?: { label: string; amount: number }[];
};
type Item = { id: string; product_id: string | null; description: string | null; version: string; sleeve: string; size: string; qty: number; print_name: string | null; print_number: string | null; patches: string[] };
type Product = { id: string; title_ar: string | null; title_en: string; primary_image_url: string | null; photo_status: string | null };

const ils = (agorot: number) => `${(agorot / 100).toLocaleString("en-US")}₪`;

// customer's view of the order lifecycle
const STEPS = [
  { label: "تأكدت", statuses: ["confirmed", "paid"] },
  { label: "بالمصنع", statuses: ["in_supplier_batch", "produced"] },
  { label: "بالطريق", statuses: ["at_warehouse", "with_courier"] },
  { label: "وصلت", statuses: ["delivered"] },
];
const CONFIRMED = STEPS.flatMap((s) => s.statuses);

export default async function OrderPage({ params }: PageProps<"/o/[token]">) {
  const { token } = await params;
  const id = readOrderToken(token);
  if (!id) notFound();
  const o = (await db().from("orders").select("id,number,status,total,payment_method,payment_status,address,quote,confirmed_at,created_at").eq("id", id).maybeSingle()).data as
    { id: string; number: number; status: string; total: number; payment_method: string | null; payment_status: string; address: Record<string, string | null> | null; quote: Quote | null; confirmed_at: string | null; created_at: string } | null;
  if (!o || o.status === "cancelled") notFound();

  const items = ((await db().from("order_items").select("id,product_id,description,version,sleeve,size,qty,print_name,print_number,patches").eq("order_id", o.id).order("created_at")).data ?? []) as Item[];
  const pids = [...new Set(items.map((i) => i.product_id).filter(Boolean))] as string[];
  const products = pids.length ? ((await db().from("products").select("id,title_ar,title_en,primary_image_url,photo_status").in("id", pids)).data ?? []) as Product[] : [];
  const q = o.quote;
  const confirmed = CONFIRMED.includes(o.status) || o.status === "delivered";
  const stepIndex = STEPS.findIndex((s) => s.statuses.includes(o.status));
  const paypalReady = !!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET;
  const names = items.filter((i) => i.print_name || i.print_number).length;
  const nameAddon = q?.lines.flatMap((l) => l.addons).filter((a) => a.id === "name_number").reduce((s, a) => s + a.amount, 0) ?? 0;
  const otherAddons = q?.lines.flatMap((l) => l.addons).filter((a) => a.id !== "name_number").reduce((s, a) => s + a.amount, 0) ?? 0;
  const shirtsOnly = (q?.itemsTotal ?? 0) - nameAddon - otherAddons;
  const date = new Date(o.confirmed_at ?? o.created_at).toLocaleDateString("ar-EG-u-nu-latn", { timeZone: "Asia/Jerusalem", day: "numeric", month: "long" });

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-12 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <span dir="ltr" className="text-[20px] font-black uppercase leading-none tracking-[-0.04em]">Kitverse</span>
        <span dir="ltr" className="font-mono text-sm text-muted">#{o.number}</span>
      </header>

      <section className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-bold leading-tight">{confirmed ? "طلبيتك" : "ملخص الطلبية"}</h1>
        <p className="text-sm text-muted">{confirmed ? `تأكدت ${date} · ${q?.delivery?.days ?? "7-14"} يوم انشالله (لا يشمل جمعة وسبت)` : "لما تتأكد من كلشي، ثبت الطلبية معنا بالشات"}</p>
      </section>

      {confirmed ? (
        <ol className="grid grid-cols-4 gap-1.5" aria-label="حالة الطلبية">
          {STEPS.map((s, i) => {
            const done = i <= stepIndex;
            return (
              <li key={s.label} className="flex flex-col gap-1.5">
                <span className={`h-1.5 rounded-full ${done ? "bg-pitch" : "bg-line-2"}`} />
                <span className={`flex items-center gap-1 text-xs ${i === stepIndex ? "font-semibold text-pitch" : done ? "text-ink-2" : "text-muted"}`}>
                  {done && i < stepIndex ? <Check className="h-3 w-3" /> : null}{s.label}
                </span>
              </li>
            );
          })}
        </ol>
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
                  <h2 className="text-[15px] font-semibold leading-snug">{p?.title_ar ?? it.description ?? p?.title_en}</h2>
                  {line ? (
                    <div className="shrink-0 text-left tabular-nums">
                      <div className="text-[15px] font-semibold">{ils(line.unitPrice * line.qty)}</div>
                      {line.offerId && line.groupPrice > line.unitPrice ? <div className="text-xs text-muted line-through">{ils(line.groupPrice * line.qty)}</div> : null}
                    </div>
                  ) : null}
                </div>
                <div className="text-[13px] text-ink-2">
                  {it.version === "player" ? "نسخة اللاعب" : "نسخة المشجعين"} · {it.sleeve === "long" ? "كم طويل" : "كم قصير"} · مقاس <span dir="ltr" className="font-semibold">{it.size}</span>{it.qty > 1 ? ` · ×${it.qty}` : ""}
                </div>
                {printed ? (
                  <div className="flex items-center gap-2">
                    <span dir="ltr" className="inline-flex items-baseline gap-1.5 rounded bg-ink px-2 py-0.5 font-mono text-[12px] uppercase tracking-[0.12em] text-paper">
                      {it.print_name}<b className="text-[14px] tracking-normal">{it.print_number}</b>
                    </span>
                    <span className="text-xs text-muted">طباعة عالضهر</span>
                  </div>
                ) : null}
                {it.patches.length ? <div className="text-xs text-muted">{it.patches.map((x) => PATCHES[x as PatchId]?.label_ar ?? x).join(" + ")}</div> : null}
              </div>
            </article>
          );
        })}
      </section>

      {q ? (
        <section className="flex flex-col gap-2.5 text-[15px]">
          <Row label={`البلايز (${items.reduce((s, i) => s + i.qty, 0)})`} value={ils(shirtsOnly + (q.offer?.saving ?? 0))} />
          {q.offer?.saving ? <Row label="عرض الـ3 بلايز" value={`-${ils(q.offer.saving)}`} tone="green" /> : null}
          {nameAddon ? <Row label={`الاسم والرقم (${names})`} value={ils(nameAddon)} /> : null}
          {otherAddons ? <Row label="رقع وإضافات" value={ils(otherAddons)} /> : null}
          {(q.orderAddons ?? []).map((a) => <Row key={a.label} label={a.label} value={ils(a.amount)} />)}
          {q.discountTotal ? <Row label="خصم" value={`-${ils(q.discountTotal)}`} tone="green" /> : null}
          <Row label={q.delivery ? `التوصيل · ${q.delivery.label}` : "التوصيل"} value={q.delivery ? ils(q.delivery.fee) : "—"} />
          <div className="mt-1 flex items-end justify-between border-t border-ink pt-3">
            <span className="font-semibold">المجموع</span>
            <span className="flex flex-col items-end">
              <span dir="ltr" className="text-[30px] font-bold leading-none tabular-nums">{ils(o.total)}</span>
              <span className="mt-1 text-xs text-muted">واصل لباب البيت</span>
            </span>
          </div>
        </section>
      ) : null}

      {o.address?.full_name || o.address?.town ? (
        <section className="flex items-start gap-3 rounded-md bg-surface p-4 ring-1 ring-line">
          <Truck className="mt-0.5 h-5 w-5 shrink-0 text-pitch" strokeWidth={1.75} />
          <div className="text-sm">
            <div className="font-semibold">{o.address.full_name}</div>
            <div className="text-ink-2">{o.address.town} · الشليح بتصل فيك يوم قبل</div>
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-2.5">
        <h2 className="text-sm font-semibold text-ink-2">طريقة الدفع</h2>
        <PayOption icon={Banknote} title="كاش عند الاستلام" text="بتدفع للشليح لما توصلك الطلبية" selected={o.payment_method !== "paypal"} />
        <PayOption icon={CreditCard} title="PayPal أو بطاقة" text={paypalReady ? "ادفع هلأ بأمان عن طريق PayPal" : "قريبًا"} selected={o.payment_method === "paypal"} disabled={!paypalReady} />
        {o.payment_status === "paid" ? <p className="flex items-center gap-1.5 text-sm font-medium text-pitch"><Check className="h-4 w-4" /> مدفوعة، شكرًا الك</p> : null}
      </section>

      <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
        ارجاع خلال 14 يوم من الاستلام، البلوزة مش ملبوسة ومع التيكت. البلايز المطبوع عليها اسم ورقم بترجع بس اذا الطباعة غلط او فيها عيب. اذا وصلك اشي مضروب، ابعتلنا صور خلال 48 ساعة.
      </p>

      <a href="https://ig.me/m/kitversejerseys" className="flex items-center justify-center gap-2 rounded-md bg-pitch-fill py-3.5 text-[15px] font-semibold text-white active:scale-[.99]">
        <MessageCircle className="h-5 w-5" strokeWidth={1.75} /> عندك سؤال؟ راسلنا عالانستغرام
      </a>
      <footer className="flex justify-center gap-3 text-xs text-muted"><span dir="ltr">@kitversejerseys</span><a href="/privacy" className="underline">الخصوصية</a></footer>
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
