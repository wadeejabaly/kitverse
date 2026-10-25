import "server-only";
import { db, must } from "../db";
import { notify } from "../notify";
import { normalizePhone, validatePrint, type PatchId } from "./rules";
import { requote, type OrderRow } from "./draft";
import { orderLink, orderToken } from "./link";
import type { CreateOrderRequest } from "../checkout";
import { getProduct as getStoreProduct } from "@/data/catalog";
import { sanitizePatch } from "../product";

/**
 * Website checkout -> the same orders table, pricing engine and admin as Instagram orders.
 * The browser never sends prices: every line is re-priced here from the current price list.
 */
export type WebOrderResult =
  | { ok: true; number: number; token: string; url: string; total: number }
  | { ok: false; code: "invalid_request" | "cart_empty" | "server_error"; detail?: string };

const PATCH: Record<string, PatchId[]> = { none: [], league: ["league"], ucl: ["champions_league"], worldcup: ["world_cup"] };

/** "MESSI 10" / "10 MESSI" / "MESSI" / "10" -> printed name + number */
export function splitNameNumber(raw?: string): { name: string | null; number: string | null } {
  const s = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return { name: null, number: null };
  const num = s.match(/\b\d{1,2}\b/)?.[0] ?? null;
  const name = s.replace(/\b\d{1,2}\b/, "").trim() || null;
  return { name: name?.toUpperCase() ?? null, number: num };
}

export async function createWebOrder(req: CreateOrderRequest): Promise<WebOrderResult> {
  const c = req.customer;
  const phone = normalizePhone(c.phone);
  if (!phone) return { ok: false, code: "invalid_request", detail: "phone" };

  const handles = [...new Set(req.items.map((i) => i.handle))];
  const products = must(await db().from("products").select("id,handle,title_en,status").in("handle", handles), "web products") as { id: string; handle: string; title_en: string; status: string }[];
  const lines = req.items.map((i) => ({ i, p: products.find((p) => p.handle === i.handle && p.status !== "hidden") }));
  if (!lines.length) return { ok: false, code: "cart_empty" };
  if (lines.some((l) => !l.p)) return { ok: false, code: "invalid_request", detail: "unknown product" };
  for (const { i } of lines) {
    const { name, number } = splitNameNumber(i.nameNumber);
    const err = validatePrint(name, number);
    if (err) return { ok: false, code: "invalid_request", detail: err };
  }

  // one customer per phone number (Instagram customers who also buy on the site get matched later by the owner)
  let customerId = (await db().from("customers").select("id").eq("phone", phone).is("ig_user_id", null).limit(1).maybeSingle()).data?.id as string | undefined;
  if (!customerId) {
    customerId = (must(await db().from("customers").insert({ full_name: c.name, phone, email: c.email, preferred_language: req.locale === "en" ? "en" : "ar" }).select("id").single(), "web customer") as { id: string }).id;
  }

  const address = { full_name: c.name, phone, email: c.email, town: c.city, street: c.street, house_number: c.houseNumber, recipient_name: c.name, notes: c.notes || null };
  const order = must(await db().from("orders").insert({
    customer_id: customerId, status: "awaiting_confirmation", source: "website", zone_id: c.region, address,
    gift_boxes: req.giftBoxQty ?? 0, notes: c.notes || null,
  }).select("*").single(), "web order") as OrderRow;

  try {
    must(await db().from("order_items").insert(lines.map(({ i, p }) => {
      const { name, number } = splitNameNumber(i.nameNumber);
      // club shirts: league/UCL patch, national shirts: World Cup patch - anything else is dropped
      const store = getStoreProduct(i.handle);
      const patch = store ? sanitizePatch(i.patch, store) : "none";
      return { order_id: order.id, product_id: p!.id, description: p!.title_en, audience: "adult", version: i.version, sleeve: "short", size: i.size, qty: i.qty, print_name: name, print_number: number, patches: PATCH[patch] ?? [] };
    })).select("id"), "web items");
    const q = await requote(order);
    const row = must(await db().from("orders").update({ status: "confirmed", payment_method: "cod", confirmed_at: new Date().toISOString(), total: q.total })
      .eq("id", order.id).select("number,total").single(), "confirm web order") as { number: number; total: number };
    must(await db().from("order_events").insert({ order_id: order.id, from_status: "awaiting_confirmation", to_status: "confirmed", actor: "customer", note: "website checkout, cash on delivery" }).select("id"), "web order event");
    await notify({ kind: "order.new", priority: "urgent", title: `New website order #${row.number} - ₪${row.total / 100}`, body: `${c.name}, ${c.city} · cash on delivery`, link: `/admin/orders/${order.id}` });
    return { ok: true, number: row.number, token: orderToken(order.id), url: orderLink(order.id), total: row.total };
  } catch (e) {
    await db().from("orders").update({ status: "cancelled", notes: `checkout failed: ${(e as Error).message.slice(0, 200)}` }).eq("id", order.id);
    return { ok: false, code: "server_error", detail: (e as Error).message };
  }
}
