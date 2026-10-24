/**
 * Builds the bot's voice examples from the owner's real DMs (anonymised) and
 * holds out a set of conversations for evaluation (never shown to the bot).
 *   KV_CONVS=/path/to/convs.json npx tsx --conditions=react-server scripts/import-style.ts
 * convs.json is the parsed Instagram export; it is NOT stored in the repo.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

type Msg = { who: "OWNER" | "CUST"; text: string; ts: string; media: string[]; links: string[] };
type Conv = { id: string; msgs: Msg[] };

const SYSTEM_LINE = /replied to an ad|Reacted .* to your message|^Liked a message|sent an attachment|^$/i;

/** Remove personal data: phone numbers, emails, long digit runs, leading vocative names ("يوسف، ..."). */
export function anonymise(s: string): string {
  return s
    .replace(/(\+?972|0)[\s-]?5\d([\s-]?\d){7}/g, "[phone]")
    .replace(/\b\d{7,}\b/g, "[number]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^[\p{L}]{2,15}\s*[،,]\s*/u, "")
    .trim();
}

const looksLikeDetails = (s: string) => /(\d[\s-]?){9,}/.test(s) || /(شارع|رقم البيت|حي |street)/i.test(s);

const SITUATIONS: [string, RegExp][] = [
  ["details_request", /اسم الكامل|رقم تلفون|عنوان الكامل/],
  ["confirmation", /توكل|اتكل|ثبتت|نثبت|نهائي/],
  ["delivery", /توصيل|لوين|شحن|يوم|الشالياح|شركة التوصيل/],
  ["delay_status", /صار مع|تأخر|تاخر|وين الطلب|وصلت|الطلبية جاهزة|اعياد|جمارك/],
  ["haggling", /خصم|بتنزل|غالي|يغالي|ارخص|حسم/],
  ["quality_original", /جودة|جوده|اصلي|اورجينال|اوريجينال|طبق الاصل|1:1|١:١|تقليد/],
  ["sizing", /مقاس|نمرة|نمره|طول|وزن|size|ضيق|واسع/i],
  ["price", /قديش|سعر|كم حق|بكم|₪|شيكل/],
  ["offer", /عرض|300|3 ب|٣ ب/],
  ["printing_patches", /اسم|رقم|شارة|شاره|رقعة|patch/i],
  ["payment", /كاش|bit|بيت|فيزا|دفع|مقدمة|عربون|رعبون|باي بال|paypal/i],
  ["photos", /صور|صورة|صوره/],
  ["washing", /غسيل|اغسل|نشافة|مقلوب/],
  ["greeting", /^(اهلا|أهلا|هلا|سلام|مرحبا|مساء|صباح|يعطيك)/],
  ["thanks_closing", /شكرا|تسلم|يسلمو|نهارك|ليلتك|الله يعطيك/],
];
const situationOf = (cust: string, owner: string) => SITUATIONS.find(([, re]) => re.test(cust) || re.test(owner))?.[0] ?? "other";

async function main() {
  const convs: Conv[] = JSON.parse(readFileSync(process.env.KV_CONVS!, "utf8"));
  const heldOut = convs.filter((c) => createHash("sha1").update(c.id).digest()[0] < 48).map((c) => c.id); // ~19%
  writeFileSync(process.env.KV_HELDOUT ?? "heldout.json", JSON.stringify(heldOut));

  const rows: { situation: string; customer_text: string; owner_reply: string; lang: string; source: string }[] = [];
  for (const c of convs) {
    if (heldOut.includes(c.id)) continue;
    const msgs = c.msgs.filter((m) => !SYSTEM_LINE.test(m.text.trim()));
    for (let i = 0; i < msgs.length; ) {
      const cust: string[] = [];
      while (i < msgs.length && msgs[i].who === "CUST") { if (msgs[i].text.trim()) cust.push(msgs[i].text.trim()); i++; }
      const own: string[] = [];
      while (i < msgs.length && msgs[i].who === "OWNER") { if (msgs[i].text.trim()) own.push(msgs[i].text.trim()); i++; }
      if (!cust.length || !own.length) continue;
      const ct = cust.join("\n"), ot = own.join("\n");
      if (looksLikeDetails(ct) || ot.length > 600 || ct.length > 500) continue; // skip addresses + pasted templates
      const customer_text = anonymise(ct), owner_reply = own.map(anonymise).filter(Boolean).join("\n");
      if (!customer_text || !owner_reply) continue;
      rows.push({ situation: situationOf(customer_text, owner_reply), customer_text, owner_reply, lang: /[؀-ۿ]/.test(customer_text) ? "ar" : "other", source: "dm-2026-09" });
    }
  }
  await db.from("style_examples").delete().eq("source", "dm-2026-09");
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("style_examples").insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
  const by = rows.reduce<Record<string, number>>((a, r) => ((a[r.situation] = (a[r.situation] ?? 0) + 1), a), {});
  console.log(`style examples: ${rows.length} from ${convs.length - heldOut.length} conversations; held out ${heldOut.length}`, by);
}

if (process.argv[1]?.endsWith("import-style.ts")) main().catch((e) => { console.error(e); process.exit(1); });
