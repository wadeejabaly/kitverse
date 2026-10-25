import "server-only";
import { db } from "./db";

/** $ per million tokens (input, output, cache read, 5-minute cache write). */
export const PRICES: Record<string, { in: number; out: number; read: number; write: number }> = {
  "claude-opus-5-5": { in: 4, out: 20, read: 0.2, write: 5 },
  "claude-sonnet-5-5": { in: 2, out: 10, read: 0.2, write: 2.5 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, read: 0.01, write: 0.125 },
  "claude-haiku-4-5": { in: 1, out: 5, read: 0.1, write: 1.25 }, // photo checks (PHOTO_QA_MODEL)
};

export interface TokenUsage { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }

export function costUsd(model: string, u: TokenUsage): number {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  return (u.input_tokens * p.in + u.output_tokens * p.out + (u.cache_read_input_tokens ?? 0) * p.read + (u.cache_creation_input_tokens ?? 0) * p.write) / 1e6;
}

/** Record an AI call made outside a bot turn, so "AI cost today" and the spend cap include it. Never throws. */
export async function logAiUsage(source: "photo_check" | "post_match", model: string, u: TokenUsage) {
  const r = await db().from("ai_usage").insert({
    source, model, input_tokens: u.input_tokens, output_tokens: u.output_tokens,
    cache_read_tokens: u.cache_read_input_tokens ?? 0, cache_write_tokens: u.cache_creation_input_tokens ?? 0, cost_usd: costUsd(model, u),
  });
  if (r.error) console.error("ai usage log failed", r.error.message);
}
