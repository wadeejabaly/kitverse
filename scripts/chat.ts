/**
 * Talk to the bot locally (no Instagram, no job runner) - same pipeline, channel "simulator".
 *   npm run chat -- --user omar "مرحبا قديش البلوزة؟"
 *   npm run chat -- --user omar --image ./shirt.jpg "بدي هاي"
 *   npm run chat -- --user omar --reset
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const args = process.argv.slice(2);
  const take = (flag: string) => { const i = args.indexOf(flag); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const user = take("--user") ?? "tester";
  const image = take("--image");
  const reset = args.includes("--reset");
  const text = args.filter((a) => a !== "--reset").join(" ").trim();

  const { db } = await import("../src/lib/db");
  const { storeInbound, getOrCreateConversation } = await import("../src/lib/conversation/ingest");
  const { processConversation } = await import("../src/lib/conversation/process");

  if (reset) {
    const { conv, customer } = await getOrCreateConversation("simulator", user);
    await db().from("orders").delete().eq("conversation_id", conv.id).in("status", ["draft", "quoted", "awaiting_details", "awaiting_confirmation"]);
    await db().from("conversations").delete().eq("id", conv.id);
    await db().from("customers").delete().eq("id", customer.id).eq("ig_user_id", `sim:${user}`);
    console.log(`reset ${user}`);
    if (!text) return;
  }

  let attachments: { type: string; url: string }[] | undefined;
  if (image) {
    const path = `simulator/${user}/${Date.now()}.jpg`;
    const up = await db().storage.from("media").upload(path, readFileSync(image), { contentType: "image/jpeg", upsert: true });
    if (up.error) throw up.error;
    attachments = [{ type: "image", url: db().storage.from("media").getPublicUrl(path).data.publicUrl }];
  }
  const r = await storeInbound("simulator", { type: "message", senderId: user, recipientId: "kitverse", timestamp: Date.now(), text: text || undefined, attachments });
  const t0 = Date.now();
  const res = await processConversation(r.conversationId);
  const sent = await db().from("messages").select("kind,text,product_ids").eq("conversation_id", r.conversationId).eq("direction", "out")
    .gte("created_at", new Date(t0 - 1000).toISOString()).order("created_at");
  console.log(`\n[${res.status}${res.reason ? `: ${res.reason}` : ""}${res.outcome ? ` / ${res.outcome}` : ""} · $${(res.costUsd ?? 0).toFixed(4)} · ${((Date.now() - t0) / 1000).toFixed(1)}s]`);
  for (const m of sent.data ?? []) console.log(m.kind === "image" ? `  📷 [photo ${m.product_ids?.[0] ?? ""}]` : `  ${m.text}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
