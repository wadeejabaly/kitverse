/**
 * Order updates the OWNER sends to a buyer from his own WhatsApp Business app (owner request
 * 2026-11-14: "message people who bought - thanks for your order, a link to track and the estimated
 * delivery time", "one tap from my phone", "on WhatsApp Business"). Nothing is sent automatically:
 * the admin order page builds the text and a wa.me link that opens the chat with it already written;
 * he presses Send. (Automatic WhatsApp needs Meta business verification + approved templates - see
 * CLAUDE.md "WhatsApp order alert".)
 *
 * Pure (tested in whatsapp-text.test.ts). The customer never gets the carrier or its tracking number,
 * only their own order page, which shows the status and the estimated arrival.
 */

export type WaKind = "thanks" | "packed" | "out_for_delivery" | "delivered";
export type WaLang = "ar" | "he" | "en";

export interface WaOrder {
  name: string | null;
  number: number;
  link: string;
  /** "YYYY-MM-DD" range, "soon", or null when there is no estimate (delivered / not confirmed) */
  eta: { from: string; to: string } | "soon" | null;
  /** cash-on-delivery amount still to collect, as display text ("₪250"), or null */
  codAmount: string | null;
}

/** The message language (owner rule 2026-11-14): a name written in Hebrew letters -> Hebrew, anything else -> Arabic. */
export function waLangFor(name: string | null | undefined): WaLang {
  return /[\u0590-\u05FF]/.test(name ?? "") ? "he" : "ar";
}

/** Which message fits the order's status now (the admin also offers the others). */
export function waKindFor(status: string): WaKind | null {
  if (["confirmed", "paid", "in_supplier_batch"].includes(status)) return "thanks";
  if (["produced", "at_warehouse"].includes(status)) return "packed";
  if (status === "with_courier") return "out_for_delivery";
  if (status === "delivered") return "delivered";
  return null;
}

const LOCALE: Record<WaLang, string> = { ar: "ar-EG-u-nu-latn", he: "he-IL", en: "en-GB" };

function day(ymd: string, lang: WaLang): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString(LOCALE[lang], { timeZone: "UTC", day: "numeric", month: "long" });
}

function etaLine(o: WaOrder, lang: WaLang): string | null {
  if (!o.eta) return null;
  const label = { ar: "الوصول المتوقع", he: "הגעה משוערת", en: "Estimated arrival" }[lang];
  if (o.eta === "soon") return `${label}: ${{ ar: "بالأيام القريبة", he: "בימים הקרובים", en: "in the next few days" }[lang]}`;
  const range = o.eta.from === o.eta.to ? day(o.eta.from, lang) : `${day(o.eta.from, lang)} – ${day(o.eta.to, lang)}`;
  return `${label}: ${range}`;
}

export function waMessage(kind: WaKind, lang: WaLang, o: WaOrder): string {
  const first = (o.name ?? "").trim().split(/\s+/)[0] ?? "";
  const hi = { ar: first ? `أهلين ${first} 👋` : "أهلين 👋", he: first ? `היי ${first} 👋` : "היי 👋", en: first ? `Hi ${first} 👋` : "Hi 👋" }[lang];
  const n = `#${o.number}`;
  const track = { ar: `تابع طلبيتك من هون: ${o.link}`, he: `מעקב אחרי ההזמנה: ${o.link}`, en: `Track your order here: ${o.link}` }[lang];
  const cod = o.codAmount ? { ar: `المبلغ عند الاستلام: ${o.codAmount}`, he: `לתשלום במסירה: ${o.codAmount}`, en: `To pay on delivery: ${o.codAmount}` }[lang] : null;
  const eta = etaLine(o, lang);
  const body: Record<WaKind, Record<WaLang, string>> = {
    thanks: {
      ar: `شكراً على طلبيتك من KitVerse! 🙏 رقم الطلبية ${n}.`,
      he: `תודה על ההזמנה מ-KitVerse! 🙏 מספר הזמנה ${n}.`,
      en: `Thanks for your order from KitVerse! 🙏 Order ${n}.`,
    },
    packed: {
      ar: `طلبيتك ${n} عم تتغلّف وتنبعت لمخزننا لفحص الجودة 📦`,
      he: `ההזמנה ${n} נארזת ונשלחת למחסן שלנו לבדיקת איכות 📦`,
      en: `Your order ${n} is being packed and sent to our warehouse for a quality check 📦`,
    },
    out_for_delivery: {
      ar: `طلبيتك ${n} طلعت للتوصيل 🚚 بتوصلك خلال 24-72 ساعة، والشليح رح يتصل فيك قبل.`,
      he: `ההזמנה ${n} יצאה למשלוח 🚚 היא תגיע תוך 24-72 שעות, והשליח יתקשר לפני.`,
      en: `Your order ${n} is out for delivery 🚚 It arrives within 24-72 hours and the courier will call you first.`,
    },
    delivered: {
      ar: `إن شاء الله وصلتك طلبيتك ${n} وعجبتك 🙌 شكراً إنك اخترت KitVerse! إذا في أي إشي، احكيلنا هون.`,
      he: `מקווים שההזמנה ${n} הגיעה ושאתה נהנה ממנה 🙌 תודה שבחרת ב-KitVerse! אם יש משהו, כתבו לנו כאן.`,
      en: `We hope your order ${n} arrived and you love it 🙌 Thanks for choosing KitVerse! If anything's not right, message us here.`,
    },
  };
  const lines = [hi, body[kind][lang]];
  if (kind === "thanks" || kind === "packed") { if (eta) lines.push(eta); }
  if (kind !== "delivered" && cod) lines.push(cod);
  if (kind !== "delivered") lines.push(track);
  return lines.join("\n");
}

/** Israeli phone ("050-123-4567", "+972 50...", "972501234567") -> wa.me digits, or null if it isn't one. */
export function waPhone(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (/^9725\d{8}$/.test(d)) return d;
  if (/^05\d{8}$/.test(d)) return `972${d.slice(1)}`;
  if (/^5\d{8}$/.test(d)) return `972${d}`;
  return d.length >= 10 && d.length <= 15 && !d.startsWith("0") ? d : null;
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
