"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { addExpense, removeExpense, saveCosts, type ProfitFormState } from "../../profit-actions";
import { ILS_FIELDS, PAY_METHODS, SUPPLIER_FIELDS, type Costs, type Expense } from "@/lib/profit/costs";
import { Card, SectionTitle, button, input, ils, cx } from "../../ui";

const INITIAL: ProfitFormState = { ok: true, message: "" };
const shek = (agorot: number) => (agorot ? String(agorot / 100) : "");

type Field = { key: (typeof SUPPLIER_FIELDS)[number] | (typeof ILS_FIELDS)[number]; label: string; hint?: string };
const SUPPLIER: Field[] = [
  { key: "shirtFan", label: "Fan shirt" },
  { key: "shirtPlayer", label: "Player shirt" },
  { key: "shirtRetro", label: "Retro shirt" },
  { key: "longSleeveExtra", label: "Long sleeve - extra per shirt" },
  { key: "bigSizeExtra", label: "3XL / 4XL - extra per shirt" },
  { key: "kidsSet", label: "Kids set" },
  { key: "adultSet", label: "Adult set (shirt + shorts)" },
  { key: "nameNumber", label: "Name + number, per shirt" },
  { key: "patch", label: "One patch" },
  { key: "supplierShippingPerShirt", label: "Shipping to Israel, per shirt", hint: "leave 0 if it's included in the prices above" },
];
const LOCAL: Field[] = [
  { key: "deliveryNorth", label: "Delivery to the customer - north", hint: "what the courier charges you, per order" },
  { key: "deliveryOther", label: "Delivery to the customer - rest of Israel" },
  { key: "giftBox", label: "Gift box" },
  { key: "scarf", label: "Scarf" },
  { key: "keychain", label: "Keychain" },
];

const METHOD_NAMES: Record<(typeof PAY_METHODS)[number], string> = {
  cod: "Cash on delivery", bit_personal: "Bit transfer", paypal_me: "PayPal.Me", paypal: "PayPal (card)", bit: "Bit (card page)",
};

/** "Your costs" - the owner's own numbers the profit is calculated from (owner request 2026-11-13). */
export function CostsForm({ costs }: { costs: Costs }) {
  const [state, action, pending] = useActionState(saveCosts, INITIAL);
  const [currency, setCurrency] = useState<"ILS" | "USD">(costs.supplierCurrency);
  const sym = currency === "USD" ? "$" : "₪";
  const box = (f: Field, symbol: string) => (
    <label key={f.key} className="grid gap-1 text-sm">
      <span className="font-medium text-ink-2">{f.label}</span>
      <span className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">{symbol}</span>
        <input name={f.key} defaultValue={shek(costs[f.key])} inputMode="decimal" placeholder="0" className={cx(input, "pl-7 tabular-nums")} />
      </span>
      {f.hint ? <span className="text-[11px] text-muted">{f.hint}</span> : null}
    </label>
  );
  return (
    <Card>
      <SectionTitle>Your costs</SectionTitle>
      <p className="-mt-1 mb-4 text-xs text-muted">Profit uses these for every order - change them any time (all periods are recalculated).</p>
      <form action={action} className="grid gap-5">
        <div className="grid gap-3">
          <div className="text-sm font-bold text-ink">From the supplier</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-muted">Prices in</span>
              <select name="supplierCurrency" value={currency} onChange={(e) => setCurrency(e.target.value as "ILS" | "USD")} className={cx(input, "h-9 w-auto py-0")}>
                <option value="USD">US dollars ($)</option>
                <option value="ILS">Shekels (₪)</option>
              </select>
            </span>
              {currency === "USD" ? (
                <label className="flex items-center gap-1.5 whitespace-nowrap"><span className="text-muted">₪ per $</span>
                  <span className="block w-20"><input name="usdRate" defaultValue={costs.usdRate || ""} inputMode="decimal" placeholder="3.20" className={cx(input, "h-9 tabular-nums")} /></span></label>
              ) : <input type="hidden" name="usdRate" value={costs.usdRate || 0} />}
          </div>
          <div className="grid items-start gap-3 sm:grid-cols-2">{SUPPLIER.map((f) => box(f, sym))}</div>
        </div>
        <div className="grid gap-3">
          <div className="text-sm font-bold text-ink">In Israel (₪)</div>
          <div className="grid items-start gap-3 sm:grid-cols-2">{LOCAL.map((f) => box(f, "₪"))}</div>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium text-ink-2">Payment & collection fees</div>
          <div className="grid gap-2">
            {PAY_METHODS.map((m) => (
              <div key={m} className="grid grid-cols-[1fr_6.5rem_6.5rem] items-center gap-2 text-sm">
                <span className="text-ink-2">{METHOD_NAMES[m]}</span>
                <span className="relative">
                  <input name={`fee_${m}_pct`} defaultValue={costs.fees[m].pct || ""} inputMode="decimal" placeholder="0" className={cx(input, "pr-7 tabular-nums")} aria-label={`${METHOD_NAMES[m]} percent`} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">%</span>
                </span>
                <span className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">+₪</span>
                  <input name={`fee_${m}_fixed`} defaultValue={shek(costs.fees[m].fixed)} inputMode="decimal" placeholder="0" className={cx(input, "pl-9 tabular-nums")} aria-label={`${METHOD_NAMES[m]} fixed fee`} />
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">E.g. PayPal takes a percent of the total; a courier may charge a fixed amount to collect cash.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={button.primary}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save costs</button>
          {state.message ? <span className={cx("text-sm", state.ok ? "text-green" : "text-red")} role="status">{state.message}</span> : null}
        </div>
      </form>
    </Card>
  );
}

/** Other expenses (rent, packaging, Meta ads paid elsewhere...) - counted in the period of their date. */
export function ExpensesCard({ expenses, today, periodTotal, periodLabel, icon }: { expenses: Expense[]; today: string; periodTotal: number; periodLabel: string; icon: React.ReactNode }) {
  const [state, action, pending] = useActionState(addExpense, INITIAL);
  return (
    <Card>
      <SectionTitle><span className="inline-flex items-center gap-2">{icon} Other expenses</span></SectionTitle>
      <p className="-mt-1 mb-4 text-xs text-muted">Anything else you pay for - packaging, tools, photos, ads paid outside Meta. {periodLabel}: <b className="text-ink">{ils(periodTotal)}</b>.</p>
      <form action={action} className="grid gap-2 sm:grid-cols-[8.5rem_1fr_6.5rem_auto] sm:items-end">
        <input type="date" name="date" defaultValue={today} className={cx(input, "h-10 py-0")} aria-label="Date" />
        <input name="label" placeholder="What was it?" maxLength={80} className={cx(input, "h-10")} aria-label="What was it" />
        <span className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">₪</span>
          <input name="amount" inputMode="decimal" placeholder="0" className={cx(input, "h-10 pl-7 tabular-nums")} aria-label="Amount" />
        </span>
        <button type="submit" disabled={pending} className={cx(button.primary, "h-10")}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add</button>
      </form>
      {state.message ? <p className={cx("mt-2 text-sm", state.ok ? "text-green" : "text-red")} role="status">{state.message}</p> : null}
      {expenses.length ? (
        <ul className="mt-4 divide-y divide-line/60 text-sm">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2">
              <span className="w-24 shrink-0 text-xs tabular-nums text-muted">{e.date}</span>
              <span className="min-w-0 flex-1 truncate text-ink-2" dir="auto">{e.label}</span>
              <span className="tabular-nums text-ink">{ils(e.amount)}</span>
              <form action={removeExpense}>
                <input type="hidden" name="id" value={e.id} />
                <button type="submit" aria-label={`Remove ${e.label}`} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-red-soft hover:text-red"><Trash2 className="h-3.5 w-3.5" /></button>
              </form>
            </li>
          ))}
        </ul>
      ) : <p className="mt-4 text-sm text-muted">No other expenses yet.</p>}
    </Card>
  );
}
