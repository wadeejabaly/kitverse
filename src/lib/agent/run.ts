import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { db, must } from "../db";
import { currentPriceList } from "../pricing/load";
import { SYSTEM_PROMPT, priceListBlock } from "./prompt";
import { toolParams, runTool, type ToolContext, type OutboxItem } from "./tools";
import { recentMessages, toApiMessages } from "./history";
import { buildState, type ConversationRow, type CustomerRow } from "./state";
import { VOICE_SYSTEM, voicePrompt } from "./voice";
import { allowedAmounts, unexpectedAmounts, toBubbles, isNoReply, looksLikeMeta, extractReply, wrongLanguage } from "./guard";
import { openOrder, requote } from "../orders/draft";
import { settings } from "../conversation/limits";
import { isBotModel } from "./models";
import { costUsd } from "../ai-cost";


export interface AgentResult {
  outbox: OutboxItem[];              // photos first, then text bubbles
  approvals: string[];
  handoff: boolean;
  outcome: "replied" | "approval" | "handoff" | "blocked" | "error" | "no_reply";
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number; costUsd: number };
  toolCalls: { name: string; input: unknown; isError: boolean; ms: number }[];
  model: string;
}

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 3 }));

export async function runAgent(conv: ConversationRow, customer: CustomerRow, opts: { effort?: "low" | "medium" | "high"; extraSystem?: string } = {}): Promise<AgentResult> {
  const chosen = (await settings<{ model?: string }>("ai_model", {})).model;
  const model = isBotModel(chosen) ? chosen : env().ANTHROPIC_MODEL;
  // server-side refusal fallback exists for Opus/Sonnet only
  const fallback = model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 };
  const toolCalls: AgentResult["toolCalls"] = [];
  const ctx: ToolContext = {
    conversationId: conv.id, customerId: customer.id, outbox: [], after: [], approvals: [], handoff: false,
    customerLabel: customer.full_name ?? customer.display_name ?? customer.ig_username ?? "Customer",
  };

  const list = await currentPriceList();
  const rows = await recentMessages(conv.id);
  const productIds = [...new Set(rows.flatMap((r) => [...r.product_ids, ...(r.reply_to?.product_ids ?? [])]))];
  const titles = new Map<string, string>();
  if (productIds.length) {
    const ps = must(await db().from("products").select("id,title_ar,title_en").in("id", productIds), "titles") as { id: string; title_ar: string | null; title_en: string }[];
    ps.forEach((p) => titles.set(p.id, p.title_ar ?? p.title_en));
  }
  const history = toApiMessages(rows, titles);
  if (!history.length) return { outbox: [], approvals: [], handoff: false, outcome: "no_reply", usage, toolCalls, model };

  const state = await buildState(conv, customer, rows);
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: priceListBlock(list.data, list.status), cache_control: { type: "ephemeral" } },
  ];
  const tools = toolParams();
  // cache the chat so far: the next call (tool loop, next turn) re-reads it at a tenth of the price
  const lastTurn = history[history.length - 1];
  const lastBlocks = [...(lastTurn.content as Anthropic.Beta.BetaContentBlockParam[])];
  lastBlocks[lastBlocks.length - 1] = { ...lastBlocks[lastBlocks.length - 1], cache_control: { type: "ephemeral" } } as Anthropic.Beta.BetaContentBlockParam;
  const base: Anthropic.Beta.BetaMessageParam[] = [...history.slice(0, -1), { ...lastTurn, content: lastBlocks }, { role: "system", content: state.text + (opts.extraSystem ? `\n\n${opts.extraSystem}` : "") }];
  const messages: Anthropic.Beta.BetaMessageParam[] = [...base];

  const call = async (msgs: Anthropic.Beta.BetaMessageParam[], toolChoice?: Anthropic.Beta.BetaToolChoiceNone) => {
    const t0 = Date.now();
    const r = await anthropic().beta.messages.create({
      model, max_tokens: 4000, system, tools, messages: msgs, ...(toolChoice ? { tool_choice: toolChoice } : {}),
      output_config: { effort: opts.effort ?? "medium" }, ...fallback,
    });
    console.log(`[agent] model call ${Date.now() - t0}ms (${r.stop_reason})`);
    const u = r.usage;
    usage.input += u.input_tokens; usage.output += u.output_tokens;
    usage.cacheRead += u.cache_read_input_tokens ?? 0; usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
    usage.costUsd += costUsd(model, u);
    return r;
  };

  let final: Anthropic.Beta.BetaMessage | null = null;
  for (let step = 0; step < 10; step++) {
    const r = await call(messages);
    if (r.stop_reason === "refusal") return { outbox: [], approvals: ctx.approvals, handoff: true, outcome: "error", usage, toolCalls, model };
    if (r.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: r.content }); continue; }
    const uses = r.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (r.stop_reason !== "tool_use" || !uses.length) { final = r; break; }
    messages.push({ role: "assistant", content: r.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      const t0 = Date.now();
      const res = await runTool(ctx, u.name, u.input);
      toolCalls.push({ name: u.name, input: u.input, isError: res.isError, ms: Date.now() - t0 });
      results.push({ type: "tool_result", tool_use_id: u.id, content: res.content, is_error: res.isError });
    }
    messages.push({ role: "user", content: results });
  }
  if (!final) return { outbox: ctx.outbox, approvals: ctx.approvals, handoff: true, outcome: "error", usage, toolCalls, model };

  const rawText = (r: Anthropic.Beta.BetaMessage) => r.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n");
  let text = extractReply(rawText(final)).text;
  const customerTexts = rows.filter((m) => m.direction === "in").slice(-4).map((m) => m.text ?? m.transcript ?? "");

  // output guards (the model's own text only - ctx.after is fixed text): (1) every amount must come from the price list or the current quote,
  // (2) no internal/meta text. One tool-less rewrite, then hand the chat to the owner.
  const o = await openOrder(conv.id);
  const q = o ? await requote(o) : state.quote;
  const problems = (t: string) => {
    const bad = unexpectedAmounts(t, allowedAmounts(list.data, q));
    const p: string[] = [];
    if (bad.length) p.push(`it states ${bad.join(", ")}₪, which is not in the price list or the current quote (you may not change prices or give discounts; use only get_quote numbers)`);
    if (looksLikeMeta(t)) p.push("it contains internal/meta text (tools, 'the customer', 'this turn', notes to yourself) that the customer must never see");
    if (wrongLanguage(t, customerTexts)) p.push("it contains English sentences but the customer writes Arabic - reply fully in his Arabic dialect (names, sizes and numbers may stay in Latin letters)");
    return p;
  };
  const found = problems(text);
  if (found.length) {
    const fix = await call([...messages, { role: "system", content: `Your draft reply to the customer was:\n"""\n${text}\n"""\nIt cannot be sent because ${found.join("; and ")}. Write the corrected customer-facing reply in the customer's language and the owner's style inside <reply></reply>.` }], { type: "none" });
    text = extractReply(rawText(fix)).text;
    if (problems(text).length) {
      return { outbox: [], approvals: ctx.approvals, handoff: true, outcome: "blocked", usage, toolCalls, model };
    }
  }

  // final voice pass: same content, the owner's exact way of writing it (kept only if it still passes the guards)
  if (text && !isNoReply(text) && env().BOT_VOICE_PASS !== "off") {
    try {
      const tail = rows.slice(-10).filter((m) => m.text || m.transcript).map((m) => ({ who: m.direction === "in" ? "customer" as const : "owner" as const, text: (m.text ?? m.transcript ?? "").slice(0, 300) }));
      const lastIn = [...rows].reverse().find((m) => m.direction === "in" && (m.text || m.transcript));
      const t0 = Date.now();
      const user = await voicePrompt({ tail, draft: text, photosSent: ctx.outbox.filter((x) => x.type === "image").length, lastCustomerText: lastIn?.text ?? lastIn?.transcript ?? "" });
      const r = await anthropic().beta.messages.create({
        model, max_tokens: 2000, system: [{ type: "text", text: VOICE_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }], output_config: { effort: "low" }, ...fallback,
      });
      console.log(`[agent] voice pass ${Date.now() - t0}ms`);
      const u = r.usage;
      usage.input += u.input_tokens; usage.output += u.output_tokens;
      usage.cacheRead += u.cache_read_input_tokens ?? 0; usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
      usage.costUsd += costUsd(model, u);
      const voiced = extractReply(rawText(r)).text;
      if (voiced && !isNoReply(voiced) && !problems(voiced).length) text = voiced;
    } catch (e) {
      console.error("voice pass failed", (e as Error).message); // keep the draft
    }
  }

  if (!text || isNoReply(text)) {
    return { outbox: [...ctx.outbox, ...ctx.after], approvals: ctx.approvals, handoff: ctx.handoff, outcome: ctx.outbox.length || ctx.after.length ? "replied" : "no_reply", usage, toolCalls, model };
  }
  const outbox: OutboxItem[] = [...ctx.outbox, ...toBubbles(text).map((t) => ({ type: "text" as const, text: t })), ...ctx.after];
  return { outbox, approvals: ctx.approvals, handoff: ctx.handoff, outcome: ctx.handoff ? "handoff" : ctx.approvals.length ? "approval" : "replied", usage, toolCalls, model };
}
