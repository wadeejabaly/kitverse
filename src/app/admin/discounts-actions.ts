"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";

const CODE_RE = /^[A-Z0-9_-]{3,24}$/;

/** ILS text input -> agorot integer, same conversion admin Pricing uses (src/app/admin/pricing-actions.ts). */
function agorot(raw: FormDataEntryValue | null, max: number): number | null {
  const v = String(raw ?? "").trim().replace(",", ".");
  if (!v) return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n * 100);
}

function isoOrNull(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Owner creates a new code from admin Discounts. One Save per code (unlike Pricing's one Save for everything), since each code is its own row. */
export async function createDiscountCode(form: FormData) {
  const staff = await requireStaff();
  const bad = (msg: string) => redirect(`/admin/discounts?error=${encodeURIComponent(msg)}`);

  const code = String(form.get("code") ?? "").trim().toUpperCase();
  if (!CODE_RE.test(code)) return bad(`Code "${code}" - use 3-24 letters, numbers, - or _`);

  const kind = z.enum(["percent", "fixed"]).safeParse(form.get("kind"));
  if (!kind.success) return bad("Pick percent or fixed");

  let value: number | null;
  if (kind.data === "percent") {
    const n = Number(String(form.get("value") ?? "").trim());
    value = Number.isFinite(n) && n > 0 && n <= 100 ? Math.round(n) : null;
    if (value === null) return bad("Percent off must be between 1 and 100");
  } else {
    value = agorot(form.get("value"), 5000);
    if (!value) return bad("Enter how much the code takes off");
  }

  const minOrder = agorot(form.get("minOrder"), 100000);
  if (minOrder === null) return bad("Minimum order doesn't look right");

  const maxUsesRaw = String(form.get("maxUses") ?? "").trim();
  let maxUses: number | null = null;
  if (maxUsesRaw) {
    const n = Number(maxUsesRaw);
    if (!Number.isInteger(n) || n < 1) return bad("Max uses must be a whole number of at least 1");
    maxUses = n;
  }

  const startsAt = isoOrNull(form.get("startsAt"));
  const endsAt = isoOrNull(form.get("endsAt"));
  if (startsAt && endsAt && startsAt >= endsAt) return bad("The end date has to be after the start date");

  const ins = await db().from("discount_codes").insert({
    code, kind: kind.data, value, min_order: minOrder, max_uses: maxUses, starts_at: startsAt, ends_at: endsAt, active: true,
  }).select("code");
  if (ins.error) {
    return bad(ins.error.code === "23505" ? `A code "${code}" already exists` : "Couldn't save that code");
  }
  await db().from("audit_log").insert({ actor: staff.id, action: "discount_code.create", entity: "discount_codes", entity_id: code, after: { kind: kind.data, value, min_order: minOrder, max_uses: maxUses, starts_at: startsAt, ends_at: endsAt } });
  revalidatePath("/admin/discounts");
  redirect("/admin/discounts?saved=1");
}

/** Pause / resume a code without losing its settings or use count. */
export async function setDiscountCodeActive(form: FormData) {
  const staff = await requireStaff();
  const code = z.string().min(1).parse(form.get("code"));
  const active = form.get("active") === "1";
  must(await db().from("discount_codes").update({ active }).eq("code", code).select("code"), "toggle code");
  await db().from("audit_log").insert({ actor: staff.id, action: active ? "discount_code.resume" : "discount_code.pause", entity: "discount_codes", entity_id: code });
  revalidatePath("/admin/discounts");
}

/** Deletes a code outright. Past orders keep their own adjustment row (reason: the code text) regardless, so history is unaffected. */
export async function deleteDiscountCode(form: FormData) {
  const staff = await requireStaff();
  const code = z.string().min(1).parse(form.get("code"));
  must(await db().from("discount_codes").delete().eq("code", code).select("code"), "delete code");
  await db().from("audit_log").insert({ actor: staff.id, action: "discount_code.delete", entity: "discount_codes", entity_id: code });
  revalidatePath("/admin/discounts");
}
