import "server-only";
import { db, must } from "../db";
import { currentPriceList } from "../pricing/load";
import { quote, type CartItem, type Quote } from "../pricing/engine";
import { getProduct } from "../catalog/search";
import { allTeams } from "../catalog/teams";
import { resolveTown } from "../localities";
import { normalizeSize, normalizePhone, validatePrint, checkPatches, type PatchId } from "./rules";

const OPEN = ["draft", "quoted", "awaiting_details", "awaiting_confirmation"] as const;

export interface OrderRow {
  id: string; number: number; status: string; customer_id: string; conversation_id: string | null;
  zone_id: string | null; address: Record<string, string | null> | null; total: number; quote: Quote | null;
  payment_method: "cod" | "paypal" | null; payment_status: string; price_list_version_id: string | null; confirmed_at: string | null;
}

export interface ItemRow {
  id: string; product_id: string | null; description: string | null; audience: "adult" | "women" | "kids";
  version: "fan" | "player"; sleeve: "short" | "long"; size: string; qty: number; print_name: string | null;
  print_number: string | null; patches: string[]; box: boolean;
}

export async function openOrder(conversationId: string): Promise<OrderRow | null> {
  const r = await db().from("orders").select("*").eq("conversation_id", conversationId).in("status", OPEN as unknown as string[])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (r.error) throw new Error(`openOrder: ${r.error.message}`);
  return r.data as OrderRow | null;
}

export async function getOrCreateOpenOrder(conversationId: string, customerId: string): Promise<OrderRow> {
  const o = await openOrder(conversationId);
  if (o) return o;
  return must(await db().from("orders").insert({ conversation_id: conversationId, customer_id: customerId, status: "draft" }).select("*").single(), "create order") as OrderRow;
}

export async function orderItems(orderId: string): Promise<ItemRow[]> {
  return must(await db().from("order_items").select("*").eq("order_id", orderId).order("created_at"), "order items") as ItemRow[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; needsOwner?: string };

export interface NewItem {
  product_id: string; audience: "adult" | "women" | "kids"; version: "fan" | "player"; sleeve: "short" | "long";
  size: string; qty?: number; print_name?: string | null; print_number?: string | null; patches?: PatchId[]; box?: boolean;
}

/** Validate a line against the catalog + rules. Returns the row to store, or why it can't be added. */
async function prepareItem(it: NewItem): Promise<Result<Omit<ItemRow, "id">>> {
  const p = await getProduct(it.product_id);
  if (!p || p.status === "hidden") return { ok: false, error: "unknown product id - search the catalog first" };
  const opt = p.options.find((o) => o.audience === it.audience && o.version === it.version && o.sleeve === it.sleeve);
  if (!opt) {
    const have = p.options.map((o) => `${o.audience}/${o.version}/${o.sleeve}`).join(", ");
    return { ok: false, error: `this shirt is not listed as ${it.audience}/${it.version}/${it.sleeve}. Listed: ${have}`, needsOwner: "variant not in supplier catalog" };
  }
  const size = normalizeSize(it.size, it.audience);
  if (!size) return { ok: false, error: `unknown size "${it.size}" - adult S-4XL, kids 2-28` };
  if (opt.sizes && !opt.sizes.includes(size)) return { ok: false, error: `size ${size} not available (available: ${opt.sizes.join(", ")})`, needsOwner: "size not available" };
  const printErr = validatePrint(it.print_name, it.print_number);
  if (printErr) return { ok: false, error: printErr };
  const team = (await allTeams()).find((t) => t.id === p.team_id);
  const patchErr = it.patches?.length && team ? checkPatches(it.patches, team) : null;
  if (patchErr) return { ok: false, error: patchErr, needsOwner: `patch check: ${patchErr}` };
  if (it.box) {
    const list = await currentPriceList();
    if (!list.data.addons.some((a) => a.id === "gift_box")) return { ok: false, error: "gift boxes are not on the price list" };
  }
  return { ok: true, value: {
    product_id: p.id, description: p.title_en, audience: it.audience, version: it.version, sleeve: it.sleeve, size,
    qty: Math.max(1, Math.min(50, it.qty ?? 1)), print_name: it.print_name?.trim() || null, print_number: it.print_number?.trim() || null,
    patches: it.patches ?? [], box: !!it.box,
  } };
}

export async function addItem(order: OrderRow, it: NewItem): Promise<Result<ItemRow>> {
  const prep = await prepareItem(it);
  if (!prep.ok) return prep;
  const row = must(await db().from("order_items").insert({ order_id: order.id, ...prep.value }).select("*").single(), "add item") as ItemRow;
  return { ok: true, value: row };
}

export async function updateItem(order: OrderRow, itemId: string, patch: Partial<NewItem>): Promise<Result<ItemRow>> {
  const cur = (await orderItems(order.id)).find((i) => i.id === itemId);
  if (!cur || !cur.product_id) return { ok: false, error: "no such line in the order" };
  const merged: NewItem = {
    product_id: patch.product_id ?? cur.product_id, audience: patch.audience ?? cur.audience, version: patch.version ?? cur.version,
    sleeve: patch.sleeve ?? cur.sleeve, size: patch.size ?? cur.size, qty: patch.qty ?? cur.qty,
    print_name: patch.print_name !== undefined ? patch.print_name : cur.print_name,
    print_number: patch.print_number !== undefined ? patch.print_number : cur.print_number,
    patches: (patch.patches ?? cur.patches) as PatchId[], box: patch.box ?? cur.box,
  };
  const prep = await prepareItem(merged);
  if (!prep.ok) return prep;
  const row = must(await db().from("order_items").update(prep.value).eq("id", itemId).eq("order_id", order.id).select("*").single(), "update item") as ItemRow;
  return { ok: true, value: row };
}

export async function removeItem(order: OrderRow, itemId: string): Promise<Result<true>> {
  const r = await db().from("order_items").delete().eq("id", itemId).eq("order_id", order.id).select("id");
  if (r.error) throw new Error(`remove item: ${r.error.message}`);
  return r.data?.length ? { ok: true, value: true } : { ok: false, error: "no such line in the order" };
}

export async function setDeliveryTown(order: OrderRow, town: string): Promise<Result<{ zone_id: string; town: string }>> {
  const hit = await resolveTown(town);
  if (!hit) return { ok: false, error: `unknown town "${town}"`, needsOwner: `delivery zone for town "${town}"` };
  const address = { ...(order.address ?? {}), town: hit.locality.name_ar ?? hit.locality.name_en, locality_id: hit.locality.id };
  must(await db().from("orders").update({ zone_id: hit.locality.zone_id, address }).eq("id", order.id).select("id"), "set zone");
  order.zone_id = hit.locality.zone_id; order.address = address;
  return { ok: true, value: { zone_id: hit.locality.zone_id, town: address.town as string } };
}

/** Recompute the quote from the current lines + zone + approved adjustments and save it on the order. */
export async function requote(order: OrderRow): Promise<Quote> {
  const list = await currentPriceList();
  const items = await orderItems(order.id);
  const cart: CartItem[] = [];
  for (const i of items) {
    if (!i.product_id) continue;
    const p = await getProduct(i.product_id);
    if (!p) continue;
    cart.push({
      key: i.id, title: p.title_ar ?? p.title_en, audience: i.audience, version: i.version, sleeve: i.sleeve, era: p.era,
      kitWithShorts: p.is_kit_with_shorts, size: i.size, qty: i.qty, printNameNumber: !!(i.print_name || i.print_number),
      patches: i.patches.length,
    });
  }
  const adj = must(await db().from("adjustments").select("reason,amount").eq("order_id", order.id), "adjustments") as { reason: string; amount: number }[];
  const boxes = items.filter((i) => i.box).reduce((n, i) => n + i.qty, 0); // one gift box per boxed shirt
  const q = quote(list.data, { items: cart, zoneId: order.zone_id, adjustments: adj.map((a) => ({ label: a.reason, amount: a.amount })),
    orderAddons: boxes ? [{ id: "gift_box", qty: Math.min(boxes, 10) }] : [] });
  const status = order.status === "draft" && cart.length ? "quoted" : order.status;
  must(await db().from("orders").update({
    quote: q, subtotal: q.itemsTotal, discount_total: q.discountTotal, delivery_fee: q.delivery?.fee ?? 0, total: q.total,
    price_list_version_id: list.id, status,
  }).eq("id", order.id).select("id"), "save quote");
  order.quote = q; order.total = q.total; order.status = status; order.price_list_version_id = list.id;
  return q;
}

export interface Details { full_name: string; phone: string; town?: string; street?: string; house_number?: string; landmark?: string; recipient_name?: string; phone_alt?: string }

export async function setCustomerDetails(order: OrderRow, d: Details): Promise<Result<{ missing: string[] }>> {
  const phone = normalizePhone(d.phone);
  if (!phone) return { ok: false, error: `phone "${d.phone}" doesn't look like an Israeli number` };
  if (d.town) {
    const t = await setDeliveryTown(order, d.town);
    if (!t.ok) return t;
  }
  const address = {
    ...(order.address ?? {}), full_name: d.full_name.trim(), phone, phone_alt: d.phone_alt ? normalizePhone(d.phone_alt) : null,
    street: d.street?.trim() || null, house_number: d.house_number?.trim() || null, landmark: d.landmark?.trim() || null,
    recipient_name: d.recipient_name?.trim() || d.full_name.trim(),
  };
  const missing: string[] = [];
  if (!order.zone_id) missing.push("town");
  if (!address.street && !address.landmark) missing.push("street + house number (or a landmark)");
  const status = missing.length ? "awaiting_details" : "awaiting_confirmation";
  must(await db().from("orders").update({ address, status }).eq("id", order.id).select("id"), "save details");
  must(await db().from("customers").update({ full_name: address.full_name, phone, phone_alt: address.phone_alt }).eq("id", order.customer_id).select("id"), "save customer");
  order.address = address; order.status = status;
  return { ok: true, value: { missing } };
}

/** Final step. The server re-checks everything; the bot cannot confirm an incomplete order. */
export async function confirmOrder(order: OrderRow, paymentMethod: "cod" | "paypal", customerSaidYes: boolean): Promise<Result<OrderRow>> {
  if (!customerSaidYes) return { ok: false, error: "the customer has not explicitly confirmed yet - show the summary and ask" };
  const items = await orderItems(order.id);
  if (!items.length) return { ok: false, error: "order has no items" };
  const a = order.address ?? {};
  if (!order.zone_id) return { ok: false, error: "delivery town missing" };
  if (!a.full_name || !a.phone) return { ok: false, error: "full name / phone missing" };
  if (!a.street && !a.landmark) return { ok: false, error: "street + house number (or landmark) missing" };
  const list = await currentPriceList();
  if (paymentMethod === "paypal" && !list.data.payment.paypal) return { ok: false, error: "PayPal is switched off in the price list" };
  const q = await requote(order);
  const row = must(await db().from("orders").update({
    status: "confirmed", payment_method: paymentMethod, confirmed_at: new Date().toISOString(), total: q.total,
  }).eq("id", order.id).in("status", OPEN as unknown as string[]).select("*").single(), "confirm order") as OrderRow;
  must(await db().from("order_events").insert({ order_id: order.id, from_status: order.status, to_status: "confirmed", actor: "bot", note: `payment: ${paymentMethod}` }).select("id"), "order event");
  return { ok: true, value: row };
}

/** Customer-facing status of their recent orders (for "شو صار مع الطلبية؟"). */
export async function customerOrders(customerId: string) {
  return must(await db().from("orders").select("number,status,total,confirmed_at,payment_method,payment_status,zone_id")
    .eq("customer_id", customerId).not("status", "in", "(draft,quoted,awaiting_details,awaiting_confirmation)")
    .order("created_at", { ascending: false }).limit(5), "customer orders");
}
