/**
 * The customer order page in the buyer's language (owner request 2026-11-14: "the link language should
 * be accordingly too" - the WhatsApp message is Hebrew for a Hebrew name, else Arabic, and its link opens
 * this page in the same language via `?l=he|en|ar`). Arabic wording is the owner's original; Hebrew and
 * English say the same things - no new promises.
 */
export type OLang = "ar" | "he" | "en";

export function oLang(v: unknown): OLang {
  return v === "he" || v === "en" ? v : "ar";
}

export const DIR: Record<OLang, "rtl" | "ltr"> = { ar: "rtl", he: "rtl", en: "ltr" };
const DATE_LOCALE: Record<OLang, string> = { ar: "ar-EG-u-nu-latn", he: "he-IL", en: "en-GB" };

export function dayLabel(lang: OLang, ymd: string) {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString(DATE_LOCALE[lang], { timeZone: "UTC", day: "numeric", month: "long" });
}
export function dateLabel(lang: OLang, iso: string) {
  return new Date(iso).toLocaleDateString(DATE_LOCALE[lang], { timeZone: "Asia/Jerusalem", day: "numeric", month: "long" });
}

type Steps = { label: string; line: string }[];

const T = {
  ar: {
    title: "طلبيتك · Kitverse",
    steps: [
      { label: "استلمناها", line: "استلمنا طلبيتك وتأكدت" },
      { label: "بالإنتاج", line: "طلبيتك بالإنتاج" },
      { label: "جاهزة", line: "طلبيتك جاهزة وعم تتحضّر لتنبعت لمخزننا" },
      { label: "بالطريق للمخزن", line: "طلبيتك بالطريق لمخزننا" },
      { label: "بالمخزن", line: "طلبيتك وصلت مخزننا" },
      { label: "بالتوصيل", line: "طلبيتك بالتوصيل إلك" },
      { label: "وصلت", line: "وصلت طلبيتك" },
    ] as Steps,
    hYours: "طلبيتك", hReceived: "استلمنا طلبيتك", hSummary: "ملخص الطلبية",
    confirmedOn: (d: string) => `تأكدت ${d}`, delivered: "وصلت 🎉",
    reviewing: "عم نراجعها ومنأكدلك خلال وقت قصير", confirmInChat: "لما تتأكد من كلشي، ثبت الطلبية معنا بالشات",
    eta: "الوصول المتوقع", soon: "بالأيام القريبة انشالله", statusAria: "حالة الطلبية",
    player: "نسخة اللاعب", fan: "نسخة المشجعين", long: "كم طويل", short: "كم قصير", size: "مقاس", printBack: "طباعة عالضهر",
    shirts: (n: number) => `البلايز (${n})`, offer3: "عرض الـ3 بلايز", nameNumber: (n: number) => `الاسم والرقم (${n})`,
    patches: "رقع وإضافات", discount: "خصم", paypalFee: "عمولة PayPal", delivery: "التوصيل", total: "المجموع", toDoor: "واصل لباب البيت",
    courierCalls: "الشليح بتصل فيك يوم قبل", payMethod: "طريقة الدفع",
    manualPaid: "تأكّدت الدفعة - ما في إشي تدفعه للشليح", manualReported: "بعتتلنا تفاصيل الدفعة - عم نتأكد منها", manualUnpaid: "لسا ما انْدفعت",
    payDetails: "تفاصيل الدفع", bitPaid: "دفعت عن طريق Bit - ما في إشي تدفعه للشليح", bitPay: "الدفع عن طريق Bit",
    cash: "كاش عند الاستلام", cashText: "بتدفع للشليح لما توصلك الطلبية", paypalTitle: "PayPal أو بطاقة",
    paypalPaid: "دفعت عن طريق PayPal - ما في إشي تدفعه للشليح", paypalNow: "ادفع هلأ بأمان عن طريق PayPal", soonFeature: "قريبًا",
    paidThanks: "مدفوعة، شكرًا الك",
    returns: "ارجاع خلال 14 يوم من الاستلام، البلوزة مش ملبوسة ومع التيكت. البلايز المطبوع عليها اسم ورقم بترجع بس اذا الطباعة غلط او فيها عيب. اذا وصلك اشي مضروب، ابعتلنا صور خلال 48 ساعة.",
    askUs: "عندك سؤال؟ راسلنا عالانستغرام", privacy: "الخصوصية",
    scarf: "شال", keychain: "ميدالية", phoneCase: "كفر موبايل", giftBox: "بوكس هدية", zoneNorth: "الشمال", zoneRest: "باقي المناطق",
  },
  he: {
    title: "ההזמנה שלך · Kitverse",
    steps: [
      { label: "התקבלה", line: "ההזמנה שלך התקבלה ואושרה" },
      { label: "בייצור", line: "ההזמנה שלך בייצור" },
      { label: "מוכנה", line: "ההזמנה שלך מוכנה ומתכוננת למשלוח למחסן שלנו" },
      { label: "בדרך למחסן", line: "ההזמנה שלך בדרך למחסן שלנו" },
      { label: "במחסן", line: "ההזמנה שלך הגיעה למחסן שלנו" },
      { label: "במשלוח", line: "ההזמנה שלך בדרך אליך" },
      { label: "הגיעה", line: "ההזמנה הגיעה" },
    ] as Steps,
    hYours: "ההזמנה שלך", hReceived: "קיבלנו את ההזמנה", hSummary: "סיכום ההזמנה",
    confirmedOn: (d: string) => `אושרה ב-${d}`, delivered: "הגיעה 🎉",
    reviewing: "אנחנו בודקים אותה ונאשר בקרוב", confirmInChat: "כשהכול מסודר, אשרו את ההזמנה איתנו בצ'אט",
    eta: "הגעה משוערת", soon: "בימים הקרובים", statusAria: "סטטוס ההזמנה",
    player: "גרסת שחקן", fan: "גרסת אוהד", long: "שרוול ארוך", short: "שרוול קצר", size: "מידה", printBack: "הדפסה על הגב",
    shirts: (n: number) => `חולצות (${n})`, offer3: "מבצע 3 חולצות", nameNumber: (n: number) => `שם ומספר (${n})`,
    patches: "פאצ'ים ותוספות", discount: "הנחה", paypalFee: "עמלת PayPal", delivery: "משלוח", total: "סה\"כ", toDoor: "עד הבית",
    courierCalls: "השליח יתקשר יום לפני", payMethod: "אמצעי תשלום",
    manualPaid: "התשלום אושר - אין מה לשלם לשליח", manualReported: "שלחתם לנו את פרטי התשלום - אנחנו בודקים", manualUnpaid: "עדיין לא שולם",
    payDetails: "פרטי תשלום", bitPaid: "שולם ב-Bit - אין מה לשלם לשליח", bitPay: "תשלום ב-Bit",
    cash: "מזומן במסירה", cashText: "משלמים לשליח כשההזמנה מגיעה", paypalTitle: "PayPal או כרטיס",
    paypalPaid: "שולם ב-PayPal - אין מה לשלם לשליח", paypalNow: "לתשלום מאובטח עכשיו ב-PayPal", soonFeature: "בקרוב",
    paidThanks: "שולם, תודה!",
    returns: "החזרה תוך 14 יום מהקבלה, חולצה לא לבושה ועם התווית. חולצות עם הדפסת שם ומספר חוזרות רק אם ההדפסה שגויה או פגומה. אם הגיע משהו פגום, שלחו לנו תמונות תוך 48 שעות.",
    askUs: "יש שאלה? כתבו לנו באינסטגרם", privacy: "פרטיות",
    scarf: "צעיף", keychain: "מחזיק מפתחות", phoneCase: "כיסוי לטלפון", giftBox: "קופסת מתנה", zoneNorth: "צפון", zoneRest: "שאר הארץ",
  },
  en: {
    title: "Your order · Kitverse",
    steps: [
      { label: "Received", line: "Your order is received and confirmed" },
      { label: "In production", line: "Your order is in production" },
      { label: "Produced", line: "Your order is produced and being prepared to ship to our warehouse" },
      { label: "To warehouse", line: "Your order is on its way to our warehouse" },
      { label: "At warehouse", line: "Your order is at our warehouse" },
      { label: "On delivery", line: "Your order is being delivered to you" },
      { label: "Delivered", line: "Your order has arrived" },
    ] as Steps,
    hYours: "Your order", hReceived: "We got your order", hSummary: "Order summary",
    confirmedOn: (d: string) => `Confirmed ${d}`, delivered: "Delivered 🎉",
    reviewing: "We're reviewing it and will confirm shortly", confirmInChat: "When everything looks right, confirm the order with us in the chat",
    eta: "Estimated arrival", soon: "In the next few days", statusAria: "Order status",
    player: "Player version", fan: "Fan version", long: "Long sleeve", short: "Short sleeve", size: "Size", printBack: "Printed on the back",
    shirts: (n: number) => `Shirts (${n})`, offer3: "3-shirt offer", nameNumber: (n: number) => `Name & number (${n})`,
    patches: "Patches & extras", discount: "Discount", paypalFee: "PayPal fee", delivery: "Delivery", total: "Total", toDoor: "Delivered to your door",
    courierCalls: "The courier calls a day before", payMethod: "Payment method",
    manualPaid: "Payment confirmed - nothing to pay the courier", manualReported: "You sent us the payment details - we're checking", manualUnpaid: "Not paid yet",
    payDetails: "Payment details", bitPaid: "Paid with Bit - nothing to pay the courier", bitPay: "Pay with Bit",
    cash: "Cash on delivery", cashText: "You pay the courier when the order arrives", paypalTitle: "PayPal or card",
    paypalPaid: "Paid with PayPal - nothing to pay the courier", paypalNow: "Pay securely now with PayPal", soonFeature: "Coming soon",
    paidThanks: "Paid - thank you",
    returns: "Returns within 14 days of delivery, unworn and with the tag. Shirts printed with a name and number can only be returned if the print is wrong or faulty. If something arrives damaged, send us photos within 48 hours.",
    askUs: "Questions? Message us on Instagram", privacy: "Privacy",
    scarf: "Scarf", keychain: "Keychain", phoneCase: "Phone case", giftBox: "Gift box", zoneNorth: "North", zoneRest: "Rest of the country",
  },
} as const;

export function strings(lang: OLang) {
  return T[lang];
}
