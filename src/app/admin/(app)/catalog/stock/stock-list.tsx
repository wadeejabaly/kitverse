"use client";

import { useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { setShirtStock } from "../../../catalog-actions";
import { Card, cx, input } from "../../../ui";

export interface StockRow { id: string; handle: string; title: string; image: string | null; inStock: boolean }

export function StockList({ rows }: { rows: StockRow[] }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState(() => new Map(rows.map((r) => [r.id, r.inStock])));
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => !q || r.title.toLowerCase().includes(q));

  function toggle(id: string) {
    const next = !state.get(id);
    setBusy(id);
    startTransition(async () => {
      try {
        await setShirtStock(id, next);
        setState((m) => new Map(m).set(id, next));
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="relative border-b border-line p-3 sm:p-4">
        <Search className="pointer-events-none absolute start-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted sm:start-7" />
        <input className={cx(input, "ps-9")} placeholder="Search shirts, e.g. Ajax 2019" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <ul className="divide-y divide-line">
        {shown.map((r) => {
          const inStock = state.get(r.id) ?? r.inStock;
          return (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2 sm:px-4">
              {r.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail
                <img src={r.image} alt="" className={cx("h-11 w-11 shrink-0 rounded-md bg-white object-contain", !inStock && "opacity-50 grayscale")} />
              ) : <span className="h-11 w-11 shrink-0 rounded-md bg-raised" />}
              <span className={cx("min-w-0 flex-1 truncate text-sm", !inStock && "text-muted")}>{r.title}</span>
              <button type="button" onClick={() => toggle(r.id)} disabled={busy === r.id} aria-pressed={inStock}
                className={cx("inline-flex min-w-28 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
                  inStock ? "border-green/40 bg-green/10 text-green hover:bg-green/20" : "border-red/40 bg-red-soft/40 text-red hover:bg-red-soft")}>
                {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {inStock ? "In stock" : "Out of stock"}
              </button>
            </li>
          );
        })}
        {!shown.length ? <li className="px-4 py-6 text-center text-sm text-muted">No shirt matches “{query}”.</li> : null}
      </ul>
    </Card>
  );
}
