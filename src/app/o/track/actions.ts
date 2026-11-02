"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, must } from "@/lib/db";
import { normalizePhone } from "@/lib/orders/rules";
import { orderToken } from "@/lib/orders/link";
import { overLimit, recordFailure } from "@/lib/rate-limit";

export interface TrackState { error?: string; orders?: { number: number; status: string; total: string; href: string }[] }

// The same lifecycle buckets /o/[token] shows, in Arabic.
const STATUS_LABEL: Record<string, string> = {
  draft: "قيد التجهيز", quoted: "قيد التجهيز", awaiting_details: "قيد التجهيز",
  awaiting_confirmation: "بانتظار التأكيد", confirmed: "تأكدت", paid: "تأكدت",
  in_supplier_batch: "بالمصنع", produced: "بالمصنع", at_warehouse: "بالطريق", with_courier: "بالطريق",
  delivered: "وصلت", issue: "في مشكلة، راسلنا",
};
const ils = (agorot: number) => `${(agorot / 100).toLocaleString("en-US")}₪`;
const ACTION = "track.lookup_failed";

/**
 * Order lookup by phone + order number (or phone + email). Sent as a form POST so the phone and
 * email never sit in a URL, and failed tries are limited per device and per phone number so order
 * numbers (1001, 1002, ...) can't be walked through for someone else's phone.
 */
export async function trackOrder(_prev: TrackState, form: FormData): Promise<TrackState> {
  const str = (k: string) => String(form.get(k) ?? "").trim().slice(0, 200);
  const phone = normalizePhone(str("phone"));
  const orderNo = str("order").replace(/[^\d]/g, "");
  const email = str("email").toLowerCase();
  if (!phone) return { error: "رقم الموبايل غير صحيح، تأكد منه وجرب كمان مرة." };
  if (!orderNo && !email) return { error: "لازم رقم الطلبية أو الإيميل اللي كتبته وقت الطلب." };

  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const keys = [`ip:${ip}`, `phone:${phone}`];
  if (await overLimit(ACTION, [{ key: keys[0], limit: 10, windowMs: 15 * 60_000 }, { key: keys[1], limit: 5, windowMs: 60 * 60_000 }])) {
    return { error: "حاولت كتير. جرب كمان شوي، أو راسلنا عالانستغرام." };
  }

  const cols = "id,number,status,total,created_at,address";
  const [byPhone, byAlt] = await Promise.all([
    db().from("orders").select(cols).eq("address->>phone", phone).neq("status", "cancelled"),
    db().from("orders").select(cols).eq("address->>phone_alt", phone).neq("status", "cancelled"),
  ]);
  type Row = { id: string; number: number; status: string; total: number; created_at: string; address: { email?: string } | null };
  const all = [...(must(byPhone, "orders by phone") as Row[]), ...(must(byAlt, "orders by alt phone") as Row[])].filter((o, i, arr) => arr.findIndex((x) => x.id === o.id) === i);
  const found = orderNo ? all.filter((o) => String(o.number) === orderNo) : all.filter((o) => (o.address?.email ?? "").toLowerCase() === email);

  if (!found.length) {
    await recordFailure(ACTION, keys);
    return { error: orderNo ? "ما لقينا طلبية بهذا الرقم على هذا الموبايل، تأكد من الرقمين." : "ما لقينا طلبية بهذا الإيميل على هذا الموبايل، تأكد منهم." };
  }
  if (found.length === 1) redirect(`/o/${orderToken(found[0].id)}`);
  return {
    orders: found.sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((o) => ({ number: o.number, status: STATUS_LABEL[o.status] ?? o.status, total: ils(o.total), href: `/o/${orderToken(o.id)}` })),
  };
}
