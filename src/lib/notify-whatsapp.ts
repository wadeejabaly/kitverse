import "server-only";
import { db, must } from "./db";
import { env } from "./env";
import type { PatchId } from "./orders/rules";

/**
 * WhatsApp order alert (owner decision 2026-11-02, Part 9): "once i approve the order automatically
 * send m[e] a whatsap[p] for each jersey with its detail[s] ... picture and added description[:]
 * player version[,] name and number[,] patch[,] size". One WhatsApp message per shirt line, not one
 * per order - a 3-shirt order sends 3 messages, each with that shirt's own photo.
 *
 * Optional, like every other integration in this file's family (env.ts): until all of
 * WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN / WHATSAPP_TO_NUMBER are set, this does nothing -
 * same as PayPal/PayPlus before their own env vars are set. Never throws: a failed WhatsApp send must
 * never block the order approval it's reporting on, so every error here is caught and logged instead.
 *
 * WHY A TEMPLATE, NOT A PLAIN MESSAGE: WhatsApp's Cloud API only allows a business to freely message
 * a number that messaged IT first within the last 24 hours. The owner's own number has no reason to
 * ever message the business number, so every alert here is business-initiated and MUST go through a
 * pre-approved message template (Meta's WhatsApp Manager - takes a few minutes to set up, then is
 * usually approved within minutes to about a day). See CLAUDE.md "WhatsApp order alert" for the exact
 * template to create: an IMAGE header plus a body with 6 placeholders, in this order:
 *   {{1}} order number   {{2}} shirt (team + title)   {{3}} version (Fan/Player)
 *   {{4}} size   {{5}} name & number (or "-")          {{6}} patches (or "-")
 */

const PATCH_LABEL_EN: Record<PatchId, string> = {
  champions_league: "Champions League", europa_league: "Europa League", club_world_cup: "Club World Cup",
  league: "League", coppa_italia: "Coppa Italia", world_cup: "World Cup",
  world_cup_peace: "World Cup Peace", world_cup_champions: "World Cup Champions",
};
const patchLabel = (id: string) => PATCH_LABEL_EN[id as PatchId] ?? id;

export function isWhatsAppConfigured(): boolean {
  const e = env();
  return !!(e.WHATSAPP_PHONE_NUMBER_ID && e.WHATSAPP_ACCESS_TOKEN && e.WHATSAPP_TO_NUMBER);
}

interface OrderLine {
  team: string; title: string; version: string; size: string; printName: string | null; printNumber: string | null;
  patches: string[]; photoUrl: string | null;
}

async function orderLines(orderId: string): Promise<OrderLine[]> {
  const items = must(
    await db().from("order_items").select("product_id,version,size,print_name,print_number,patches").eq("order_id", orderId),
    "order items",
  ) as { product_id: string | null; version: string; size: string; print_name: string | null; print_number: string | null; patches: string[] }[];
  const pids = [...new Set(items.map((i) => i.product_id).filter(Boolean))] as string[];
  const products = pids.length
    ? must(await db().from("products").select("id,title_en,primary_image_url,team:teams(name_en)").in("id", pids), "products") as unknown as
      { id: string; title_en: string; primary_image_url: string | null; team: { name_en: string } | null }[]
    : [];
  return items.map((i) => {
    const p = products.find((x) => x.id === i.product_id);
    return {
      team: p?.team?.name_en ?? "", title: p?.title_en ?? "", version: i.version === "player" ? "Player" : "Fan",
      size: i.size, printName: i.print_name, printNumber: i.print_number, patches: i.patches, photoUrl: p?.primary_image_url ?? null,
    };
  });
}

async function sendTemplate(orderNumber: number, line: OrderLine): Promise<void> {
  const e = env();
  const shirt = [line.team, line.title].filter(Boolean).join(" - ") || "Shirt";
  const nameNumber = line.printName || line.printNumber ? `${line.printName ?? ""} ${line.printNumber ?? ""}`.trim() : "-";
  const patches = line.patches.length ? line.patches.map(patchLabel).join(" + ") : "-";
  const body = {
    messaging_product: "whatsapp",
    to: e.WHATSAPP_TO_NUMBER,
    type: "template",
    template: {
      name: e.WHATSAPP_TEMPLATE_NAME,
      language: { code: "en" },
      components: [
        ...(line.photoUrl ? [{ type: "header", parameters: [{ type: "image", image: { link: line.photoUrl } }] }] : []),
        {
          type: "body",
          parameters: [
            { type: "text", text: String(orderNumber) }, { type: "text", text: shirt }, { type: "text", text: line.version },
            { type: "text", text: line.size || "-" }, { type: "text", text: nameNumber }, { type: "text", text: patches },
          ],
        },
      ],
    },
  };
  const res = await fetch(`https://graph.facebook.com/${e.WHATSAPP_GRAPH_VERSION}/${e.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${e.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) console.error("whatsapp order alert failed", res.status, await res.text().catch(() => ""));
}

/** One WhatsApp message per shirt in the order, each with that shirt's own photo. Never throws. */
export async function sendOrderWhatsAppAlerts(orderId: string): Promise<void> {
  if (!isWhatsAppConfigured()) return;
  try {
    const order = must(await db().from("orders").select("number").eq("id", orderId).single(), "order") as { number: number };
    const lines = await orderLines(orderId);
    for (const line of lines) await sendTemplate(order.number, line).catch((e) => console.error("whatsapp order alert failed", (e as Error).message));
  } catch (e) {
    console.error("whatsapp order alert failed", (e as Error).message);
  }
}
