import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { db, must } from "@/lib/db";
import { normalizePhone } from "@/lib/orders/rules";
import { orderToken } from "@/lib/orders/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "تتبع طلبيتك · Kitverse", robots: { index: false, follow: false } };

const ils = (agorot: number) => `${(agorot / 100).toLocaleString("en-US")}₪`;

// The same lifecycle buckets /o/[token] already shows, in Arabic - kept local (not imported from the
// admin dashboard's English ORDER_STATUS) so this customer-facing page has no dependency on it.
const STATUS_LABEL: Record<string, string> = {
  draft: "قيد التجهيز", quoted: "قيد التجهيز", awaiting_details: "قيد التجهيز",
  awaiting_confirmation: "بانتظار التأكيد", confirmed: "تأكدت", paid: "تأكدت",
  in_supplier_batch: "بالمصنع", produced: "بالمصنع", at_warehouse: "بالطريق", with_courier: "بالطريق",
  delivered: "وصلت", issue: "في مشكلة، راسلنا",
};

type OrderRow = { id: string; number: number; status: string; total: number; created_at: string };
type AddressRow = OrderRow & { address: { email?: string } | null };

/**
 * Self-serve order lookup (owner request 2026-11-03: "a way for the customers to be able to track
 * their order" - Instagram customers never receive the signed /o/<token> link a website checkout
 * hands out, so today their only option is DMing to ask). Phone number plus either the order number
 * or the email on the order is enough to find it; it then sends the customer straight into the exact
 * same live order page (/o/[token]) everyone else already uses - no second customer-facing view to
 * keep in sync later, no account/login, and nothing exposed from the phone number alone.
 *
 * Owner correction 2026-11-03: the second field is the order's EMAIL, not the name on it (the
 * original ask was "order number and phone number, or phone number and email" - email reads back
 * exactly, a typed name doesn't). Instagram-sourced orders have no email on them, so for those
 * customers the order number is the only second option - that's fine, it's always collected.
 */
export default async function TrackPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");
  const phoneRaw = str(sp.phone);
  const orderNoRaw = str(sp.order).replace(/[^\d]/g, "");
  const emailRaw = str(sp.email);
  const submitted = phoneRaw.length > 0;
  const phone = submitted ? normalizePhone(phoneRaw) : null;

  let error: string | null = null;
  let matches: OrderRow[] = [];

  if (submitted) {
    if (!phone) {
      error = "رقم الموبايل غير صحيح، تأكد منه وجرب كمان مرة.";
    } else if (!orderNoRaw && !emailRaw) {
      error = "لازم رقم الطلبية أو الإيميل اللي كتبته وقت الطلب.";
    } else {
      const byPhone = must(await db().from("orders").select("id,number,status,total,created_at,address")
        .eq("address->>phone", phone).neq("status", "cancelled"), "orders by phone") as AddressRow[];
      const byAlt = must(await db().from("orders").select("id,number,status,total,created_at,address")
        .eq("address->>phone_alt", phone).neq("status", "cancelled"), "orders by alt phone") as AddressRow[];
      const byThisPhone = [...byPhone, ...byAlt].filter((o, i, arr) => arr.findIndex((x) => x.id === o.id) === i);

      let found = byThisPhone;
      if (orderNoRaw) found = found.filter((o) => String(o.number) === orderNoRaw);
      else {
        const needle = emailRaw.toLowerCase();
        found = found.filter((o) => (o.address?.email ?? "").toLowerCase() === needle);
      }

      if (!found.length) {
        error = orderNoRaw
          ? "ما لقينا طلبية بهذا الرقم على هذا الموبايل، تأكد من الرقمين."
          : "ما لقينا طلبية بهذا الإيميل على هذا الموبايل، تأكد منهم.";
      }
      matches = found
        .map((o) => ({ id: o.id, number: o.number, status: o.status, total: o.total, created_at: o.created_at }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  }

  // Exactly one match - skip the list and go straight to the real order page.
  if (matches.length === 1) redirect(`/o/${orderToken(matches[0].id)}`);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-12 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <span dir="ltr" className="text-[20px] font-black uppercase leading-none tracking-[-0.04em]">Kitverse</span>
      </header>

      <section className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-bold leading-tight">تتبع طلبيتك</h1>
        <p className="text-sm text-muted">دخل رقم موبايلك ورقم الطلبية، أو الإيميل اللي كتبته وقت الطلب، ومنوريك وين وصلت.</p>
      </section>

      <form method="get" className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          رقم الموبايل
          <input name="phone" type="tel" dir="ltr" required defaultValue={phoneRaw} placeholder="05XXXXXXXX"
            className="rounded-md border border-line bg-surface px-3.5 py-3 text-[15px] outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/15" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          رقم الطلبية <span className="text-muted">(إذا موجود عندك)</span>
          <input name="order" type="text" inputMode="numeric" dir="ltr" defaultValue={orderNoRaw} placeholder="مثلا 1024"
            className="rounded-md border border-line bg-surface px-3.5 py-3 text-[15px] outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/15" />
        </label>
        <div className="flex items-center gap-2 text-xs text-muted"><span className="h-px flex-1 bg-line" />أو<span className="h-px flex-1 bg-line" /></div>
        <label className="flex flex-col gap-1.5 text-sm">
          الإيميل اللي كتبته وقت الطلب <span className="text-muted">(إذا ما عندك رقم الطلبية)</span>
          <input name="email" type="email" dir="ltr" defaultValue={emailRaw} placeholder="name@example.com"
            className="rounded-md border border-line bg-surface px-3.5 py-3 text-[15px] outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/15" />
        </label>
        <button type="submit" className="mt-1 flex items-center justify-center gap-2 rounded-md bg-pitch-fill py-3.5 text-[15px] font-semibold text-white active:scale-[.99]">
          <Search className="h-4 w-4" /> دور على الطلبية
        </button>
      </form>

      {error ? <p className="rounded-md bg-red-soft px-3.5 py-3 text-sm text-red">{error}</p> : null}

      {matches.length > 1 ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-sm font-semibold text-ink-2">لقينا أكتر من طلبية على هذا الموبايل:</h2>
          <div className="flex flex-col divide-y divide-line rounded-md border border-line">
            {matches.map((o) => (
              <a key={o.id} href={`/o/${orderToken(o.id)}`} className="flex items-center justify-between gap-3 px-3.5 py-3 active:bg-surface">
                <div className="flex flex-col">
                  <span dir="ltr" className="font-mono text-sm">#{o.number}</span>
                  <span className="text-xs text-muted">{STATUS_LABEL[o.status] ?? o.status}</span>
                </div>
                <span dir="ltr" className="tabular-nums text-sm font-semibold">{ils(o.total)}</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <a href="https://ig.me/m/kitversejerseys" className="mt-2 flex items-center justify-center gap-2 rounded-md border border-line py-3 text-sm font-medium text-ink-2 active:scale-[.99]">
        ما لقيت طلبيتك؟ راسلنا عالانستغرام
      </a>
    </main>
  );
}
