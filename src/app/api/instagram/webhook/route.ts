import type { NextRequest } from "next/server";
import { after } from "next/server";
import { env } from "@/lib/env";
import { describeWebhook, parseWebhook, sendText, verifySignature } from "@/lib/channels/instagram";
import { JOIN_CONFIRMATION, storeInbound, storeOwnerEcho } from "@/lib/conversation/ingest";
import { botMayHandle } from "@/lib/conversation/testers";
import { emit } from "@/inngest/emit";
import { EV } from "@/inngest/client";

/** Meta subscription check: echo hub.challenge when the verify token matches. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const token = env().META_WEBHOOK_VERIFY_TOKEN;
  if (p.get("hub.mode") === "subscribe" && token && p.get("hub.verify_token") === token) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

/**
 * Incoming DMs. Verify the signature, store each event, then hand the turn to the job runner
 * (debounced per conversation). Always answer 200 quickly so Meta doesn't retry/disable the hook.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), env().META_APP_SECRET)) {
    return new Response("bad signature", { status: 401 });
  }
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const myId = env().INSTAGRAM_ACCOUNT_ID;

  after(async () => {
    const events = parseWebhook(payload);
    console.log(`[webhook] ${describeWebhook(payload)} -> ${events.map((e) => e.type).join(",") || "no events"}`);
    const toWake = new Set<string>();
    for (const ev of events) {
      try {
        if (ev.type === "read" || ev.type === "unsupported" || ev.isDeleted) continue;
        const customerId = ev.type === "echo" ? ev.recipientId : ev.senderId;
        if (myId && customerId === myId) continue; // our own account
        const gate = await botMayHandle(customerId, ev.type === "message" ? ev.text : undefined);
        if (gate === "joined") { // confirm the join word with a plain message (no AI involved)
          await sendText(customerId, JOIN_CONFIRMATION).catch((e) => console.error("join confirm failed", (e as Error).message));
          continue;
        }
        if (gate !== "allow") continue; // test phase: not a tester
        if (ev.type === "echo") { await storeOwnerEcho(ev); continue; }
        const r = await storeInbound("instagram", ev);
        if (r.trigger) toWake.add(r.conversationId);
      } catch (e) {
        console.error("webhook event failed", (e as Error).message);
      }
    }
    for (const conversationId of toWake) await emit(EV.messageReceived, { conversationId });
  });
  return new Response("ok", { status: 200 });
}
