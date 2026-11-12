"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";
import { ILS_FIELDS, PAY_METHODS, SUPPLIER_FIELDS, parseCosts, parseExpenses, shekelsToAgorot } from "@/lib/profit/costs";

/** Admin Profit (owner request 2026-11-13): the owner's own costs and other expenses, in bot_settings. */

export type ProfitFormState = { ok: boolean; message: string };

export async function saveCosts(_prev: ProfitFormState, form: FormData): Promise<ProfitFormState> {
  const staff = await requireStaff();
  const value: Record<string, unknown> = { fees: {} };
  value.supplierCurrency = form.get("supplierCurrency") === "USD" ? "USD" : "ILS";
  const rate = Number(String(form.get("usdRate") ?? "").replace(",", ".").trim() || "0");
  if (!Number.isFinite(rate) || rate < 0 || rate > 20) return { ok: false, message: "The dollar rate is shekels per dollar, e.g. 3.20." };
  value.usdRate = rate;
  if (value.supplierCurrency === "USD" && !rate) return { ok: false, message: "Write the dollar rate (shekels per dollar), e.g. 3.20." };
  // the same "45.50" parser for both: it gives the amount in cents/agorot
  for (const k of [...SUPPLIER_FIELDS, ...ILS_FIELDS]) {
    const a = shekelsToAgorot(String(form.get(k) ?? "").replace("$", ""));
    if (a === null) return { ok: false, message: `"${String(form.get(k))}" isn't an amount - write it like 45 or 45.50.` };
    value[k] = a;
  }
  for (const m of PAY_METHODS) {
    const pctRaw = String(form.get(`fee_${m}_pct`) ?? "").replace(/[%\s]/g, "").replace(",", ".") || "0";
    const pct = Number(pctRaw);
    const fixed = shekelsToAgorot(String(form.get(`fee_${m}_fixed`) ?? ""));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100 || fixed === null) return { ok: false, message: "A payment fee is a percent (0-100) plus an optional fixed amount in ₪." };
    (value.fees as Record<string, unknown>)[m] = { pct, fixed };
  }
  const costs = parseCosts(value);
  must(await db().from("bot_settings").upsert({ key: "profit_costs", value: costs, updated_by: staff.id, updated_at: new Date().toISOString() }).select("key"), "save costs");
  await db().from("audit_log").insert({ actor: staff.id, action: "settings.profit_costs", entity: "bot_settings", entity_id: "profit_costs", after: costs });
  revalidatePath("/admin/profit");
  return { ok: true, message: "Saved - the profit numbers now use these costs." };
}

async function expenses() {
  return parseExpenses((await db().from("bot_settings").select("value").eq("key", "profit_expenses").maybeSingle()).data?.value);
}

export async function addExpense(_prev: ProfitFormState, form: FormData): Promise<ProfitFormState> {
  const staff = await requireStaff();
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(form.get("date"));
  const label = String(form.get("label") ?? "").trim().slice(0, 80);
  const amount = shekelsToAgorot(String(form.get("amount") ?? ""));
  if (!date.success) return { ok: false, message: "Pick the date." };
  if (!label) return { ok: false, message: "Write what the expense was." };
  if (!amount) return { ok: false, message: "Write the amount, e.g. 120." };
  const list = await expenses();
  list.push({ id: crypto.randomUUID(), date: date.data, label, amount });
  must(await db().from("bot_settings").upsert({ key: "profit_expenses", value: list, updated_by: staff.id, updated_at: new Date().toISOString() }).select("key"), "save expense");
  revalidatePath("/admin/profit");
  return { ok: true, message: `Added "${label}".` };
}

export async function removeExpense(form: FormData) {
  const staff = await requireStaff();
  const id = z.string().uuid().parse(form.get("id"));
  const list = (await expenses()).filter((e) => e.id !== id);
  must(await db().from("bot_settings").upsert({ key: "profit_expenses", value: list, updated_by: staff.id, updated_at: new Date().toISOString() }).select("key"), "remove expense");
  revalidatePath("/admin/profit");
}
