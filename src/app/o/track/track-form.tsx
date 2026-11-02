"use client";

import { useActionState } from "react";
import { Search } from "lucide-react";
import { trackOrder, type TrackState } from "./actions";

const field = "rounded-md border border-line bg-surface px-3.5 py-3 text-[15px] outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/15";

/** The lookup form. Posts to the server (nothing personal ends up in the address bar). */
export function TrackForm() {
  const [state, action, pending] = useActionState<TrackState, FormData>(trackOrder, {});
  return (
    <>
      <form action={action} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          رقم الموبايل
          <input name="phone" type="tel" dir="ltr" required placeholder="05XXXXXXXX" className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          رقم الطلبية <span className="text-muted">(إذا موجود عندك)</span>
          <input name="order" type="text" inputMode="numeric" dir="ltr" placeholder="مثلا 1024" className={field} />
        </label>
        <div className="flex items-center gap-2 text-xs text-muted"><span className="h-px flex-1 bg-line" />أو<span className="h-px flex-1 bg-line" /></div>
        <label className="flex flex-col gap-1.5 text-sm">
          الإيميل اللي كتبته وقت الطلب <span className="text-muted">(إذا ما عندك رقم الطلبية)</span>
          <input name="email" type="email" dir="ltr" placeholder="name@example.com" className={field} />
        </label>
        <button type="submit" disabled={pending} className="mt-1 flex items-center justify-center gap-2 rounded-md bg-pitch-fill py-3.5 text-[15px] font-semibold text-white active:scale-[.99] disabled:opacity-60">
          <Search className="h-4 w-4" /> دور على الطلبية
        </button>
      </form>

      {state.error ? <p className="rounded-md bg-red-soft px-3.5 py-3 text-sm text-red">{state.error}</p> : null}

      {state.orders?.length ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-sm font-semibold text-ink-2">لقينا أكتر من طلبية على هذا الموبايل:</h2>
          <div className="flex flex-col divide-y divide-line rounded-md border border-line">
            {state.orders.map((o) => (
              <a key={o.href} href={o.href} className="flex items-center justify-between gap-3 px-3.5 py-3 active:bg-surface">
                <div className="flex flex-col">
                  <span dir="ltr" className="font-mono text-sm">#{o.number}</span>
                  <span className="text-xs text-muted">{o.status}</span>
                </div>
                <span dir="ltr" className="tabular-nums text-sm font-semibold">{o.total}</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
