import "server-only";
import { env } from "@/lib/env";

/*
 * Ad spend from the Meta Marketing API (owner request 2026-11-13) - read only: this never changes a
 * campaign. Needs two env vars:
 *   META_AD_ACCOUNT_ID     the ad account number (kitversejerseys: 1754697569205817), with or without "act_"
 *   META_ADS_ACCESS_TOKEN  a Facebook token with the `ads_read` permission on that account - best a
 *                          Business Manager SYSTEM USER token (never expires); the Instagram-login token
 *                          the bot uses cannot read ads.
 * Amounts are in the ad account's own currency (checked: anything but ILS is reported, not converted).
 */

export type Campaign = { id: string; name: string; spend: number; impressions: number; clicks: number; conversations: number };
export type AdSpend =
  | { ok: true; currency: string; total: number; daily: Record<string, number>; campaigns: Campaign[] }
  | { ok: false; reason: "not_connected" | "error"; message: string };

const agorot = (s: unknown) => Math.round(Number.parseFloat(String(s ?? "0")) * 100) || 0;

type Row = Record<string, unknown> & { actions?: { action_type: string; value: string }[] };

async function graph(path: string, params: Record<string, string>): Promise<Row[]> {
  const e = env();
  const url = new URL(`https://graph.facebook.com/${e.META_GRAPH_VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", e.META_ADS_ACCESS_TOKEN);
  const rows: Row[] = [];
  let next: string | null = url.toString();
  for (let page = 0; next && page < 20; page++) {
    const res: Response = await fetch(next, { next: { revalidate: 900 } }); // 15 min cache: Meta's numbers move slowly
    const body = (await res.json().catch(() => ({}))) as { data?: Row[]; paging?: { next?: string }; error?: { message?: string } } & Row;
    if (!res.ok || body.error) throw new Error(body.error?.message ?? `Meta API ${res.status}`);
    if (Array.isArray(body.data)) rows.push(...body.data);
    else rows.push(body);
    next = body.paging?.next ?? null;
  }
  return rows;
}

/** Spend between two Israel days (YYYY-MM-DD, both included): total, per day and per campaign. */
export async function adSpend(since: string, until: string): Promise<AdSpend> {
  const e = env();
  const account = e.META_AD_ACCOUNT_ID.replace(/^act_/, "");
  if (!account || !e.META_ADS_ACCESS_TOKEN) {
    return { ok: false, reason: "not_connected", message: "Meta Ads isn't connected yet (META_AD_ACCOUNT_ID + META_ADS_ACCESS_TOKEN)." };
  }
  try {
    const timeRange = JSON.stringify({ since, until });
    const [info, daily, camps] = await Promise.all([
      graph(`act_${account}`, { fields: "currency,name" }),
      graph(`act_${account}/insights`, { fields: "spend", time_range: timeRange, time_increment: "1", level: "account", limit: "500" }),
      graph(`act_${account}/insights`, { fields: "campaign_id,campaign_name,spend,impressions,clicks,actions", time_range: timeRange, level: "campaign", limit: "500" }),
    ]);
    const byDay: Record<string, number> = {};
    for (const r of daily) if (typeof r.date_start === "string") byDay[r.date_start] = (byDay[r.date_start] ?? 0) + agorot(r.spend);
    const campaigns: Campaign[] = camps.map((r) => ({
      id: String(r.campaign_id ?? ""),
      name: String(r.campaign_name ?? "Campaign"),
      spend: agorot(r.spend),
      impressions: Number(r.impressions ?? 0) || 0,
      clicks: Number(r.clicks ?? 0) || 0,
      // messaging conversations started (the DM campaigns' result)
      conversations: Number(r.actions?.find((a) => a.action_type === "onsite_conversion.messaging_conversation_started_7d")?.value ?? 0) || 0,
    })).sort((a, b) => b.spend - a.spend);
    return { ok: true, currency: String(info[0]?.currency ?? "ILS"), total: Object.values(byDay).reduce((s, v) => s + v, 0), daily: byDay, campaigns };
  } catch (err) {
    return { ok: false, reason: "error", message: (err as Error).message };
  }
}
