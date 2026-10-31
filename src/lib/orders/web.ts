import "server-only";
import { db, must } from "../db";
import { notify } from "../notify";
import { normalizePhone, validatePrint } from "./rules";
import { requote, type OrderRow } from "./draft";
import { orderLink, orderToken } from "./link";
import type { CreateOrderRequest } from "../checkout";
import { getProduct as getStoreProduct } from "@/data/catalog";
import { sanitizePatches } from "../product";
import { resolveTown } from "../localities";
import { findActiveDiscountCode, discountAmount, recordDiscountCodeUse, codesCanCombine, type DiscountCode } from "../discounts";

/**
 * Website checkout -> the same orders table, pricing engine and admin as Instagram orders.
 * The browser never sends prices: every line is re-priced here from the current price list.
 *
 * Owner decision 2026-10-25: a website order never auto-confirms. It is saved
 * as "awaiting_confirmation" and the owner approves or declines it from
 * /admin/orders - same as the "wait for my approval, cash and card" ask.
 * The shopper's city is matched to a zone here (resolveTown, the same lookup
 * the Instagram bot uses) - never trusted from the browser.
 */
export type WebOrderResult =
  | { ok: true; number: number; token: string; url: string; total: number }
  | { ok: false; code: "invalid_request" | "cart_empty" | "unknown_city" | "invalid_discount_code" | "server_error"; detail?: string };

/** "MESSI 10" / "10 MESSI" / "MESSI" / "10" -> printed name + number */
export function splitNameNumber(raw?: string): { name: string | null; number: string | null } {
  const s = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return { name: null, number: null };
  const num = s.match(/\b\d{1,2}\b/)?.[0] ?? null;
  const name = s.replace(/\b\d{1,2}\b/, "").trim() || null;
  return { name: name?.toUpperCase() ?? null, number: num };
}

export type PrepareFailure = Extract<WebOrderResult, { ok: false }>;

/**
 * Shared by every website checkout rail (cash, PayPal, Bit): validate the
 * request, resolve the delivery town, match/insert the customer, write the
 * order + its lines, apply any discount codes, and price it. Stops short of
 * deciding what happens next — that part differs by rail (see
 * createWebOrder below for cash, src/lib/orders/online.ts for PayPal/Bit)
 * and is NOT re-validated a second time, so this is the one place a website
 * order can be written from.
 */
export type PreparedOrder = { ok: true; order: OrderRow; q: Awaited<ReturnType<typeof requote>>; notAtSupplier: string[] };

export async function prepareOrder(req: CreateOrderRequest): Promise<PrepareFailure | PreparedOrder> {
  const c = req.customer;
  const phone = normalizePhone(c.phone);
  if (!phone) return { ok: false, code: "invalid_request", detail: "phone" };

  // Discount codes (owner feature 2026-10-26): checked here, before
  // anything is written, same as the other fail-fast checks in this
  // function. Only the CODE strings are ever trusted from the browser —
  // what each is worth, whether the cart meets its minimum order, and
  // whether this combination is even allowed are all re-derived below from
  // the server's own quote and each code's own `stackable` flag, never from
  // anything the checkout page showed.
  const discounts: DiscountCode[] = [];
  for (const raw of new Set((req.discountCodes ?? []).map((c) => c.trim()).filter(Boolean))) {
    const lookup = await findActiveDiscountCode(raw);
    if (!lookup.ok) return { ok: false, code: "invalid_discount_code", detail: lookup.reason };
    discounts.push(lookup.row);
  }
  if (!codesCanCombine(discounts)) return { ok: false, code: "invalid_discount_code", detail: "not_stackable" };

  // The shopper never picks a region any more — match their typed city against
  // the same town → zone list the Instagram bot uses. An unrecognised town
  // fails cleanly here, before anything is written.
  const resolved = await resolveTown(c.city);
  if (!resolved) return { ok: false, code: "unknown_city", detail: c.city };

  const handles = [...new Set(req.items.map((i) => i.handle))];
  const products = must(await db().from("products").select("id,handle,title_en,status,flags").in("handle", handles), "web products") as { id: string; handle: string; title_en: string; status: string; flags: string[] }[];
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
    // preferred_language's CHECK already allows 'he' (supabase/migrations/20260930120000_core_schema.sql) —
    // record whichever storefront locale the shopper actually checked out in.
    const preferredLanguage = req.locale === "en" ? "en" : req.locale === "he" ? "he" : "ar";
    customerId = (must(await db().from("customers").insert({ full_name: c.name, phone, email: c.email, preferred_language: preferredLanguage }).select("id").single(), "web customer") as { id: string }).id;
  }

  const address = {
    full_name: c.name, phone, email: c.email, town: resolved.locality.name_ar ?? resolved.locality.name_en, locality_id: resolved.locality.id,
    street: c.street, house_number: c.houseNumber, recipient_name: c.name, notes: c.notes || null,
  };
  // Starts in "draft" — the vocabulary every unpriced/unpaid order starts
  // in (supabase/migrations/20260930120000_core_schema.sql). requote()
  // below bumps it to "quoted" the moment the lines exist; createWebOrder
  // (cash) and settleOnlinePayment (PayPal/Bit, src/lib/orders/online.ts)
  // each decide separately what happens after that.
  const order = must(await db().from("orders").insert({
    customer_id: customerId, status: "draft", source: "website", zone_id: resolved.locality.zone_id, address,
    gift_boxes: req.giftBoxQty ?? 0, notes: c.notes || null,
  }).select("*").single(), "web order") as OrderRow;

  try {
    must(await db().from("order_items").insert(lines.map(({ i, p }) => {
      const { name, number } = splitNameNumber(i.nameNumber);
      // re-validated against the catalogue (team type, league, the cap) - whatever the browser sent, only an eligible set is ever stored
      const store = getStoreProduct(i.handle);
      const patches = store ? sanitizePatches(i.patches, store) : [];
      return { order_id: order.id, product_id: p!.id, description: p!.title_en, audience: "adult", version: i.version, sleeve: i.sleeve, size: i.size, qty: i.qty, print_name: name, print_number: number, patches };
    })).select("id"), "web items");
    let q = await requote(order);

    if (discounts.length) {
      // Every code quotes its own cut of the SAME pre-discount items total,
      // never a shrinking base — so the order they were typed in can't
      // change what they're worth. quote() itself still caps the combined
      // total at itemsTotal (src/lib/pricing/engine.ts), so stacking several
      // codes can never discount more than 100% of the order.
      if (discounts.some((d) => q.itemsTotal < d.min_order)) {
        await db().from("orders").update({ status: "cancelled", notes: "checkout cancelled: discount code minimum order not met" }).eq("id", order.id);
        return { ok: false, code: "invalid_discount_code", detail: "min_order" };
      }
      for (const d of discounts) {
        const amount = discountAmount(d, q.itemsTotal);
        if (amount > 0) {
          must(await db().from("adjustments").insert({ order_id: order.id, kind: "discount_code", amount, reason: d.code, discount_code: d.code }).select("id"), "discount code");
          await recordDiscountCodeUse(d.code);
        }
      }
      q = await requote(order); // re-price now that every adjustment row exists
    }

    const notAtSupplier = lines.filter(({ p }) => p!.flags?.includes("not_at_supplier")).map(({ p }) => p!.title_en);
    return { ok: true, order, q, notAtSupplier };
  } catch (e) {
    await db().from("orders").update({ status: "cancelled", notes: `checkout failed: ${(e as Error).message.slice(0, 200)}` }).eq("id", order.id);
    return { ok: false, code: "server_error", detail: (e as Error).message };
  }
}

export async function createWebOrder(req: CreateOrderRequest): Promise<WebOrderResult> {
  const prepared = await prepareOrder(req);
  if (!prepared.ok) return prepared;
  const { order, q, notAtSupplier } = prepared;
  const c = req.customer;

  // Owner decision 2026-10-25: never auto-confirm. The order stays "awaiting_confirmation" —
  // the owner approves or declines it from /admin/orders (approveWebOrder / declineWebOrder).
  const row = must(await db().from("orders").update({ status: "awaiting_confirmation", payment_method: "cod", total: q.total })
    .eq("id", order.id).select("number,total").single(), "price web order") as { number: number; total: number };
  await notify({
    kind: "order.needs_approval", priority: "urgent", title: `Approve order #${row.number} - ₪${row.total / 100}`,
    body: `${c.name}, ${(order.address as { town?: string } | null)?.town ?? ""} · cash on delivery - waiting for your OK${notAtSupplier.length ? ` · not at supplier, check availability: ${notAtSupplier.join(", ")}` : ""}`, link: `/admin/orders/${order.id}`,
  });
  return { ok: true, number: row.number, token: orderToken(order.id), url: orderLink(order.id), total: row.total };
}
