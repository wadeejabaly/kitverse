import "server-only";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { db, must } from "../db";
import { searchCatalog, getProduct } from "../catalog/search";
import { bestProductPhoto, cleanAlbumPhotos } from "../catalog/photo-qa";
import { currentPriceList } from "../pricing/load";
import {
  getOrCreateOpenOrder, openOrder, orderItems, addItem, updateItem, removeItem, setDeliveryTown, requote,
  setCustomerDetails, confirmOrder, customerOrders, type OrderRow,
} from "../orders/draft";
import { createApproval, type ApprovalKind } from "../approvals";
import { normalize } from "../text";
import { recommendSize } from "./sizing";
import { notify } from "../notify";
import type { PatchId } from "../orders/rules";

export type OutboxItem = { type: "text"; text: string } | { type: "image"; url: string; productId?: string };

export interface ToolContext {
  conversationId: string;
  customerId: string;
  customerLabel: string;
  outbox: OutboxItem[];          // photos queued by tools (sent before the text reply)
  approvals: string[];           // approval ids created this turn
  handoff: boolean;
}

interface ToolDef<S extends z.ZodType> {
  name: string;
  description: string;
  schema: S;
  run: (ctx: ToolContext, input: z.infer<S>) => Promise<unknown>;
}
const tool = <S extends z.ZodType>(t: ToolDef<S>) => t;

const Audience = z.enum(["adult", "women", "kids"]);
const Version = z.enum(["fan", "player"]);
const Sleeve = z.enum(["short", "long"]);
const Kit = z.enum(["Home", "Away", "Third", "Fourth", "Goalkeeper", "Special", "Unstated"]);
const Patch = z.enum(["champions_league", "europa_league", "club_world_cup", "league", "world_cup"]);

const ils = (agorot: number) => agorot / 100;
function quoteView(q: Awaited<ReturnType<typeof requote>>) {
  return {
    summary_ar: q.summaryAr,
    total_ils: ils(q.total),
    items_ils: ils(q.itemsTotal),
    delivery: q.delivery ? { zone: q.delivery.label, fee_ils: ils(q.delivery.fee), days: q.delivery.days } : null,
    offer: q.offer ? { name: q.offer.label, saving_ils: ils(q.offer.saving) } : null,
    lines: q.lines.map((l) => ({ line_id: l.key, title: l.title, qty: l.qty, unit_ils: ils(l.unitPrice), extras: l.addons.map((a) => `${a.label} ${ils(a.amount)}₪`), line_total_ils: ils(l.lineTotal) })),
    missing: q.missing,
  };
}

async function order(ctx: ToolContext): Promise<OrderRow> {
  return getOrCreateOpenOrder(ctx.conversationId, ctx.customerId);
}

export const TOOLS = [
  tool({
    name: "search_catalog",
    description: "Find shirts in the catalog. Use English team names when you can (you may translate Arabic/Hebrew). Returns products with their product_id, season, kit, available versions/sleeves/audiences and status (featured = on the website). Newest seasons first.",
    schema: z.object({
      team: z.string().describe("Team or national team, e.g. 'Barcelona', 'Real Madrid', 'Morocco'"),
      season: z.string().nullish().describe("e.g. '2025/26', '2026' (World Cup), '2006'. Omit to list all seasons."),
      kit: Kit.nullish(),
      era: z.enum(["current", "retro"]).nullish().describe("retro = season 2022 or older"),
      audience: Audience.nullish().describe("leave empty for adults; 'kids' ONLY if the customer explicitly asked for kids"),
    }),
    run: async (_ctx, i) => {
      // kids items stay out of view unless the customer asked for kids
      const r = await searchCatalog({ team: i.team, season: i.season, kit: i.kit, era: i.era, audience: i.audience ?? "adult" });
      const kids = i.audience === "kids";
      if (!r.teams.length) return { found: false, note: "no such team in the catalog - if the customer insists, use check_availability" };
      return {
        teams: r.teams.map((t) => ({ name: t.name_en, name_ar: t.name_ar, type: t.type })),
        products: r.products.map((p) => ({
          product_id: p.id, title: p.title_ar ?? p.title_en, title_en: p.title_en, season: p.season, kit: p.kit, era: p.era,
          status: p.status,
          options: [...new Set(p.options.filter((o) => (kids ? o.audience === "kids" : o.audience !== "kids")).map((o) => `${o.audience}/${o.version}/${o.sleeve}`))],
          note: !p.season
            ? "SEASON UNKNOWN (supplier didn't say) - never present it as the new/current shirt; show the photo and say which model it is only if certain"
            : p.kit === "Special" || p.kit === "Unstated" ? "design not described in text - send the photo to confirm" : undefined,
        })),
        note: r.note === "no_products_for_filters" ? "team found but nothing for these filters - try without season/kit, or check_availability" : undefined,
      };
    },
  }),

  tool({
    name: "send_product_photos",
    description: "Queue the main photo of up to 4 products to send to the customer (sent before your text). Only clean, checked photos are ever sent; products without a clean photo are skipped and listed under no_clean_photo.",
    schema: z.object({
      product_ids: z.array(z.string()).min(1).max(4),
      kids: z.boolean().default(false).describe("true ONLY when the customer explicitly asked for a kids' shirt/kit"),
    }),
    run: async (ctx, i) => {
      const sent: string[] = [], noPhoto: string[] = [];
      for (const id of i.product_ids) {
        const p = await getProduct(id);
        const url = p ? await bestProductPhoto(p, { audience: i.kids ? "kids" : "adult" }).catch(() => null) : null;
        if (p && url) { ctx.outbox.push({ type: "image", url, productId: id }); sent.push(p.title_ar ?? p.title_en); } else noPhoto.push(p?.title_ar ?? p?.title_en ?? id);
      }
      return {
        queued: sent,
        no_clean_photo: noPhoto.length ? noPhoto : undefined,
        note: noPhoto.length ? "we have no good photo of these - describe them briefly instead and, if the customer needs to see it, say you'll send a photo soon (request_owner kind=other: 'needs a clean photo')" : undefined,
      };
    },
  }),

  tool({
    name: "send_more_photos",
    description: "Queue up to 3 extra clean photos (back, details) of one product from the supplier album. Photos with labels/watermarks are filtered out automatically.",
    schema: z.object({ product_id: z.string(), version: Version.nullish() }),
    run: async (ctx, i) => {
      const p = await getProduct(i.product_id);
      if (!p) return { error: "unknown product" };
      const opt = must(await db().from("product_options").select("supplier_album_ids,version").eq("product_id", p.id), "options") as { supplier_album_ids: string[]; version: string }[];
      const album = (opt.find((o) => !i.version || o.version === i.version) ?? opt[0])?.supplier_album_ids[0];
      if (!album) return { error: "no supplier album" };
      const urls = await cleanAlbumPhotos(p, album, 3).catch(() => [] as string[]);
      urls.forEach((url) => ctx.outbox.push({ type: "image", url, productId: p.id }));
      return { queued: urls.length };
    },
  }),

  tool({
    name: "recommend_size",
    description: "Recommend a size from height and weight (owner's rules of thumb).",
    schema: z.object({ height_cm: z.number().min(90).max(220), weight_kg: z.number().min(15).max(200), version: Version }),
    run: async (_ctx, i) => recommendSize(i.height_cm, i.weight_kg, i.version),
  }),

  tool({
    name: "add_to_order",
    description: "Add a shirt to the customer's order (creates the order if needed). Returns the line id and the updated quote from the pricing engine.",
    schema: z.object({
      product_id: z.string(), audience: Audience, version: Version, sleeve: Sleeve, size: z.string(),
      qty: z.number().int().min(1).max(50).default(1),
      print_name: z.string().nullish(), print_number: z.string().nullish(),
      patches: z.array(Patch).default([]), box: z.boolean().default(false).describe("team gift box, only where the price list has one"),
    }),
    run: async (ctx, i) => {
      const o = await order(ctx);
      const r = await addItem(o, { ...i, patches: i.patches as PatchId[] });
      if (!r.ok) return { error: r.error, needs_owner: r.needsOwner };
      return { line_id: r.value.id, size: r.value.size, quote: quoteView(await requote(o)) };
    },
  }),

  tool({
    name: "update_order_line",
    description: "Change a line in the open order (size, qty, version, sleeve, print, patches, box). Returns the updated quote.",
    schema: z.object({
      line_id: z.string(), size: z.string().nullish(), qty: z.number().int().min(1).max(50).nullish(), version: Version.nullish(),
      sleeve: Sleeve.nullish(), audience: Audience.nullish(), print_name: z.string().nullish(), print_number: z.string().nullish(),
      patches: z.array(Patch).nullish(), box: z.boolean().nullish(),
    }),
    run: async (ctx, i) => {
      const o = await openOrder(ctx.conversationId);
      if (!o) return { error: "no open order" };
      const { line_id, ...rest } = i;
      const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== null));
      const r = await updateItem(o, line_id, patch);
      if (!r.ok) return { error: r.error, needs_owner: r.needsOwner };
      return { quote: quoteView(await requote(o)) };
    },
  }),

  tool({
    name: "remove_order_line",
    description: "Remove a line from the open order.",
    schema: z.object({ line_id: z.string() }),
    run: async (ctx, i) => {
      const o = await openOrder(ctx.conversationId);
      if (!o) return { error: "no open order" };
      const r = await removeItem(o, i.line_id);
      if (!r.ok) return { error: r.error };
      return { quote: quoteView(await requote(o)) };
    },
  }),

  tool({
    name: "set_delivery_town",
    description: "Set the delivery town; returns zone, fee and delivery days. Unknown towns: ask which bigger town is nearest, or ask the owner.",
    schema: z.object({ town: z.string() }),
    run: async (ctx, i) => {
      const o = await order(ctx);
      const r = await setDeliveryTown(o, i.town);
      if (!r.ok) return { error: r.error, hint: "ask for the nearest bigger town, or request_owner(kind=other) for the zone" };
      const q = await requote(o);
      return { town: r.value.town, delivery: quoteView(q).delivery, quote: quoteView(q) };
    },
  }),

  tool({
    name: "get_quote",
    description: "The current order with the full price breakdown from the pricing engine. The ONLY source of totals.",
    schema: z.object({}),
    run: async (ctx) => {
      const o = await openOrder(ctx.conversationId);
      if (!o) return { empty: true };
      return { order_number: o.number, status: o.status, quote: quoteView(await requote(o)), address: o.address };
    },
  }),

  tool({
    name: "set_customer_details",
    description: "Save the customer's full name, phone and address on the open order.",
    schema: z.object({
      full_name: z.string().min(2), phone: z.string(), town: z.string().nullish(), street: z.string().nullish(),
      house_number: z.string().nullish(), landmark: z.string().nullish(), recipient_name: z.string().nullish(), phone_alt: z.string().nullish(),
    }),
    run: async (ctx, i) => {
      const o = await order(ctx);
      const r = await setCustomerDetails(o, {
        full_name: i.full_name, phone: i.phone, town: i.town ?? undefined, street: i.street ?? undefined, house_number: i.house_number ?? undefined,
        landmark: i.landmark ?? undefined, recipient_name: i.recipient_name ?? undefined, phone_alt: i.phone_alt ?? undefined,
      });
      if (!r.ok) return { error: r.error };
      return { saved: true, still_missing: r.value.missing };
    },
  }),

  tool({
    name: "confirm_order",
    description: "Confirm the order. Only after the customer saw the final summary and explicitly said yes. The server re-checks items, address and phone.",
    schema: z.object({ payment_method: z.enum(["cod", "paypal"]), customer_confirmed: z.boolean() }),
    run: async (ctx, i) => {
      const o = await openOrder(ctx.conversationId);
      if (!o) return { error: "no open order" };
      const items = await orderItems(o.id);
      const shirts = items.reduce((s, x) => s + x.qty, 0);
      const r = await confirmOrder(o, i.payment_method, i.customer_confirmed);
      if (!r.ok) return { error: r.error };
      const list = await currentPriceList();
      const zone = list.data.delivery.zones.find((z) => z.id === r.value.zone_id);
      await notify({ kind: "order.confirmed", priority: "normal", title: `New order #${r.value.number} - ${ctx.customerLabel}`,
        body: `${shirts} shirt(s) · ₪${ils(r.value.total)} · ${i.payment_method === "cod" ? "cash on delivery" : "PayPal"}`, link: `/admin/orders/${r.value.id}` });
      if (shirts >= 6) await createApproval({ conversationId: ctx.conversationId, orderId: r.value.id, kind: "large_order", priority: "normal", customerLabel: ctx.customerLabel, summary: `Confirmed order #${r.value.number} with ${shirts} shirts - please check before sending to the supplier.` });
      return { confirmed: true, order_number: r.value.number, total_ils: ils(r.value.total), delivery_days: zone?.days, payment_method: i.payment_method,
        next: i.payment_method === "paypal" ? "call create_payment_link and send the link" : "thank them; the courier calls a day before delivery" };
    },
  }),

  tool({
    name: "create_payment_link",
    description: "Create an online payment link for a confirmed order (PayPal).",
    schema: z.object({}),
    run: async () => ({ available: false, note: "Online payment is not switched on yet - offer cash on delivery." }),
  }),

  tool({
    name: "get_order_status",
    description: "The customer's recent confirmed orders and their real status. Use for 'what happened with my order?'.",
    schema: z.object({}),
    run: async (ctx) => {
      const rows = await customerOrders(ctx.customerId) as { number: number; status: string; total: number; confirmed_at: string | null }[];
      return { orders: rows.map((r) => ({ order_number: r.number, status: r.status, total_ils: ils(r.total), confirmed_at: r.confirmed_at })),
        status_meaning: { confirmed: "received, being prepared", in_supplier_batch: "ordered from the factory", produced: "made, on the way to our warehouse",
          at_warehouse: "arrived at our warehouse", with_courier: "with the delivery company - they call a day before", delivered: "delivered", issue: "has a problem - the owner is handling it" } };
    },
  }),

  tool({
    name: "check_availability",
    description: "For anything not in the catalog (e.g. Liverpool, Juventus, a size or version the catalog lacks, non-shirt items). Uses a remembered owner answer if one exists, otherwise asks the owner.",
    schema: z.object({ request: z.string().describe("what exactly the customer wants, in short English"), key: z.string().describe("short English key, e.g. 'liverpool 2025/26 home'") }),
    run: async (ctx, i) => {
      const key = normalize(i.key);
      const prev = await db().from("availability_answers").select("answer,description,expires_at,price_group_id").eq("query_key", key).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (prev.data && (!prev.data.expires_at || new Date(prev.data.expires_at) > new Date())) {
        return { owner_answer: prev.data.answer, details: prev.data.description, price_group: prev.data.price_group_id };
      }
      const a = await createApproval({ conversationId: ctx.conversationId, kind: "availability_check", customerLabel: ctx.customerLabel, summary: i.request, proposal: { key } });
      ctx.approvals.push(a.id);
      return { asked_owner: true, tell_customer: "a short holding line (e.g. 'تواني بشوفلك وبرجعلك'), no promises" };
    },
  }),

  tool({
    name: "request_owner",
    description: "Ask the owner to decide something you may not decide (discounts, compensation, unusual prints, changes after confirmation, complaints, returns, payment exceptions, large orders, unclear requests).",
    schema: z.object({
      kind: z.enum(["discount", "compensation", "custom_print", "change_after_batch", "cancellation", "complaint", "return", "payment_exception", "large_order", "low_confidence", "other"]),
      summary: z.string().describe("what the customer wants + your recommendation, in short English, 1-3 sentences"),
      proposed_reply: z.string().nullish().describe("the reply you would send if the owner approves, in the customer's language"),
    }),
    run: async (ctx, i) => {
      const o = await openOrder(ctx.conversationId);
      const a = await createApproval({ conversationId: ctx.conversationId, orderId: o?.id ?? null, kind: i.kind as ApprovalKind, customerLabel: ctx.customerLabel, summary: i.summary, draftReply: i.proposed_reply ?? null });
      ctx.approvals.push(a.id);
      return { asked_owner: true, tell_customer: "a short holding line, no promises" };
    },
  }),

  tool({
    name: "handoff_to_owner",
    description: "Hand the whole conversation to the owner (customer asks for a human, abuse, or you are stuck). You stop replying in this chat until the owner hands it back.",
    schema: z.object({ reason: z.string() }),
    run: async (ctx, i) => {
      ctx.handoff = true;
      must(await db().from("conversations").update({ mode: "owner", mode_until: null }).eq("id", ctx.conversationId).select("id"), "handoff");
      await notify({ kind: "conversation.handoff", priority: "urgent", title: `Chat needs you - ${ctx.customerLabel}`, body: i.reason, link: `/admin/inbox/${ctx.conversationId}` });
      return { handed_off: true, tell_customer: "one short line that someone from the team will continue with them" };
    },
  }),
];

/** JSON-schema tool list for the API (order is fixed so the prompt cache stays valid). */
export function toolParams(): Anthropic.Beta.BetaTool[] {
  return TOOLS.map((t) => {
    const schema = z.toJSONSchema(t.schema, { target: "draft-2020-12", io: "input" }) as Record<string, unknown>;
    delete schema.$schema;
    return { name: t.name, description: t.description, input_schema: schema as Anthropic.Beta.BetaTool["input_schema"] };
  });
}

export async function runTool(ctx: ToolContext, name: string, input: unknown): Promise<{ content: string; isError: boolean }> {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) return { content: JSON.stringify({ error: `unknown tool ${name}` }), isError: true };
  const parsed = t.schema.safeParse(input);
  if (!parsed.success) return { content: JSON.stringify({ error: "invalid input", issues: parsed.error.issues.slice(0, 5) }), isError: true };
  try {
    const out = await (t.run as (c: ToolContext, i: unknown) => Promise<unknown>)(ctx, parsed.data);
    return { content: JSON.stringify(out), isError: false };
  } catch (e) {
    return { content: JSON.stringify({ error: "tool failed", detail: (e as Error).message.slice(0, 300) }), isError: true };
  }
}
