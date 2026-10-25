import "server-only";
import { db, must } from "../db";
import { openOrder, orderItems, requote } from "../orders/draft";
import { pendingApprovals, recentDecisions } from "../approvals";
import { styleExamples } from "./style";
import { formatExamples } from "./voice";
import type { MessageRow } from "./history";

export interface ConversationRow {
  id: string; customer_id: string; channel: "instagram" | "simulator"; mode: string; mode_until: string | null; stage: string;
  source_type: string | null; source_ref: string | null; window_expires_at: string | null; last_customer_msg_at: string | null;
  bot_replies_total: number; unlimited_until: string | null;
}
export interface CustomerRow { id: string; ig_user_id: string | null; ig_username: string | null; display_name: string | null; full_name: string | null; tags: string[] }

const israelNow = () => new Date().toLocaleString("en-GB", { timeZone: "Asia/Jerusalem", weekday: "long", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });

/** Per-turn facts for the model, appended as a mid-conversation system message (keeps the cached prefix stable). */
export async function buildState(conv: ConversationRow, customer: CustomerRow, recent: MessageRow[]): Promise<{ text: string; quote: Awaited<ReturnType<typeof requote>> | null }> {
  const lines: string[] = [`# State (system, not from the customer)`, `Now: ${israelNow()} (Israel).`];

  const pastOrders = must(await db().from("orders").select("id", { count: "exact", head: false })
    .eq("customer_id", customer.id).not("status", "in", "(draft,quoted,awaiting_details,awaiting_confirmation,cancelled)"), "past orders") as unknown[];
  lines.push(`Customer: ${customer.full_name ?? customer.display_name ?? customer.ig_username ?? "unknown"}${pastOrders.length ? ` - returning customer, ${pastOrders.length} past order(s): be extra warm` : " - new customer"}.`);
  if (conv.source_type) lines.push(`Conversation started from: ${conv.source_type}${conv.source_ref ? ` (${conv.source_ref})` : ""}.`);
  if (conv.window_expires_at) {
    const h = (new Date(conv.window_expires_at).getTime() - Date.now()) / 3600_000;
    if (h < 4) lines.push(`Instagram reply window closes in ${Math.max(0, h).toFixed(1)}h.`);
  }

  // open order
  const o = await openOrder(conv.id);
  let quote: Awaited<ReturnType<typeof requote>> | null = null;
  if (o) {
    const items = await orderItems(o.id);
    quote = items.length ? await requote(o) : null;
    lines.push(`\n## Open order #${o.number} (status ${o.status})`);
    if (!items.length) lines.push("No shirts yet.");
    for (const i of items) {
      lines.push(`- line_id ${i.id}: ${i.description} | ${i.audience}/${i.version}/${i.sleeve} | size ${i.size} | qty ${i.qty}` +
        `${i.print_name || i.print_number ? ` | print "${i.print_name ?? ""}" ${i.print_number ?? ""}` : ""}${i.patches.length ? ` | patches ${i.patches.join("+")}` : ""}${i.box ? " | gift box" : ""}`);
    }
    if (quote) lines.push(`Quote (pricing engine): ${quote.summaryAr}${quote.missing.includes("zone") ? " - delivery town still unknown" : ""}`);
    const a = o.address ?? {};
    const have = ["full_name", "phone", "town", "street", "house_number", "landmark"].filter((k) => a[k]).join(", ");
    lines.push(`Details saved: ${have || "none"}.`);
  }

  // owner decisions + pending
  const pending = await pendingApprovals(conv.id);
  if (pending.length) {
    lines.push(`\n## Waiting for the owner (don't promise anything; if the customer asks, say you're still checking)`);
    pending.forEach((p) => lines.push(`- ${p.kind}: ${String(p.proposal.summary ?? "")}`));
  }
  const decided = await recentDecisions(conv.id);
  if (decided.length) {
    lines.push(`\n## Owner decisions (act on these now if not done yet)`);
    decided.forEach((d) => lines.push(`- ${d.kind} "${String(d.proposal.summary ?? "")}" -> ${d.status.toUpperCase()}${d.final_reply ? `; owner's answer/note: ${d.final_reply}` : ""}${d.proposal.owner_note ? `; note: ${String(d.proposal.owner_note)}` : ""}`));
  }

  // settings + announcements
  const settings = Object.fromEntries((must(await db().from("bot_settings").select("key,value").in("key", ["deposit"]), "settings") as { key: string; value: Record<string, unknown> }[]).map((s) => [s.key, s.value]));
  const dep = settings.deposit as { enabled?: boolean; min_ils?: number; max_ils?: number } | undefined;
  lines.push(`\nDeposit: ${dep?.enabled ? `required, ${dep.min_ils}-${dep.max_ils}₪ by Bit, deducted from the total, non-refundable if they cancel` : "not required (plain cash on delivery)"}.`);
  const ann = must(await db().from("announcements").select("text_ar,applies_to").eq("active", true).lte("starts_at", new Date().toISOString())
    .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`), "announcements") as { text_ar: string; applies_to: string }[];
  if (ann.length) lines.push(`Announcements to mention when relevant: ${ann.map((a) => `"${a.text_ar}" (${a.applies_to})`).join("; ")}`);

  // owner voice references for this moment
  const lastCustomer = [...recent].reverse().find((m) => m.direction === "in" && (m.text || m.transcript));
  const ex = await styleExamples(lastCustomer ? (lastCustomer.text ?? lastCustomer.transcript ?? "") : "", 8);
  if (ex.length) {
    lines.push(`\n## How the owner replied in similar moments (style reference only - never copy facts or prices)`);
    lines.push(formatExamples(ex).replaceAll("\nYou:", "\nOwner:"));
  }
  return { text: lines.join("\n"), quote };
}
