import "server-only";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { patchSupplierName } from "@/data/patches";
import type { PatchId } from "@/lib/orders/rules";
import type { BatchLine } from "./admin";

/**
 * The supplier sheet (owner request 2026-11-12). The supplier is Chinese and reads pictures, not
 * paragraphs, so this mirrors the sheet he sends back himself: an order-number row, then ONE ROW PER
 * SHIRT - the shirt's photo from the website, 3 EMPTY picture cells the owner pastes his own pictures
 * into before sending, then Fan/Player, size, NAME#NUMBER and the patch names.
 */

export const OWNER_PICTURE_SLOTS = 3;

/** Sheet language (owner request 2026-11-17): English, or Chinese for the supplier. Names/numbers stay as typed. */
export type SheetLang = "en" | "zh";
export const sheetLang = (v: string | null | undefined): SheetLang => (v === "zh" ? "zh" : "en");

const ZH = {
  Fan: "球迷版", Player: "球员版", "LONG SLEEVE": "长袖", WOMEN: "女款",
  "FULL KIT (SHIRT+SHORTS)": "成人套装（上衣+短裤）", "KIDS FULL KIT (SHIRT+SHORTS)": "童装套装（上衣+短裤）",
  "GIFT BOX": "礼盒",
} as const;

const ZH_LEAGUE: Record<string, string> = {
  "premier-league": "英超", "la-liga": "西甲", "serie-a": "意甲", bundesliga: "德甲", "ligue-1": "法甲", "saudi-pro-league": "沙特联赛",
};

/** The patch name in the supplier's words, Chinese. */
export function patchSupplierNameZh(id: string, leagueId: string | null): string {
  switch (id) {
    case "league": return `${(leagueId && ZH_LEAGUE[leagueId]) ?? "联赛"}臂章`;
    case "champions_league": return "欧冠臂章";
    case "champions_league_full": return "欧冠全套臂章+赞助";
    case "europa_league": return "欧联臂章";
    case "club_world_cup": return "世俱杯冠军金章（胸前）";
    case "ucl_final_print": return "欧冠决赛对阵烫印（胸前）";
    case "ucl_titles_badge": return "欧冠冠军次数荣誉章";
    case "ucl_respect": return "RESPECT臂章（荣誉章下方）";
    case "coppa_italia": return "意大利杯臂章";
    case "world_cup": return "世界杯臂章";
    case "world_cup_peace": return "世界杯和平臂章";
    case "world_cup_champions": return "世界杯冠军章";
    default: return patchSupplierName(id as PatchId, leagueId);
  }
}

const HEADERS: Record<SheetLang, { photo: string; pic: string; version: string; size: string; print: string; patches: string; order: string }> = {
  en: { photo: "Photo", pic: "Pic", version: "Version", size: "Size", print: "Name#Number", patches: "Patches", order: "#" },
  zh: { photo: "图片", pic: "图", version: "版本", size: "尺码", print: "名字#号码", patches: "臂章", order: "订单 #" },
};

/** "Player" / "Fan", plus LONG SLEEVE / KIDS / WOMEN only when it isn't the usual adult short sleeve. */
export function versionText(l: Pick<BatchLine, "version" | "sleeve" | "audience"> & { full_kit?: boolean }, lang: SheetLang = "en"): string {
  // a full kit = shirt + shorts (owner request 2026-11-15) - the supplier must see it, it's a different item
  const kit = l.full_kit || l.audience === "kids" ? (l.audience === "kids" ? "KIDS FULL KIT (SHIRT+SHORTS)" : "FULL KIT (SHIRT+SHORTS)") : "";
  const parts = [l.version, l.sleeve === "Long" ? "LONG SLEEVE" : "", kit || (l.audience === "women" ? "WOMEN" : "")].filter(Boolean);
  return lang === "zh" ? parts.map((w) => ZH[w as keyof typeof ZH] ?? w).join(" ") : parts.join(" ");
}

/** "OLISE#11", "OLISE", "#11" or "" - the supplier's own format. */
export function printText(l: Pick<BatchLine, "print_name" | "print_number">): string {
  const name = l.print_name.trim().toUpperCase();
  const num = l.print_number.trim();
  return num ? `${name}#${num}` : name;
}

/** The patch names, then GIFT BOX when the shirt has one. */
export function patchesText(l: Pick<BatchLine, "patch_ids" | "league_id" | "box">, lang: SheetLang = "en"): string {
  const words = l.patch_ids.map((id) => (lang === "zh" ? patchSupplierNameZh(id, l.league_id) : patchSupplierName(id as PatchId, l.league_id)));
  if (l.box) words.push(lang === "zh" ? ZH["GIFT BOX"] : "GIFT BOX");
  return words.join(" + ");
}

const PX = 96; // picture size in the sheet (pixels)

async function loadPicture(url: string, origin: string): Promise<Buffer | null> {
  try {
    const res = await fetch(new URL(url, origin), { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    return await sharp(input).resize(PX * 3, PX * 3, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
  } catch {
    return null;
  }
}

/** Builds the .xlsx. `origin` resolves the site-relative photo paths (/products/...). */
export async function buildSupplierSheet(lines: BatchLine[], origin: string, lang: SheetLang = "en"): Promise<Buffer> {
  const h = HEADERS[lang];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Batch", { views: [{ state: "frozen", ySplit: 1 }] });
  const picWidth = 15; // characters - roughly PX + margin
  ws.columns = [
    { header: h.photo, width: picWidth },
    ...Array.from({ length: OWNER_PICTURE_SLOTS }, (_, i) => ({ header: lang === "zh" ? `${h.pic}${i + 1}` : `${h.pic} ${i + 1}`, width: picWidth })),
    { header: h.version, width: 16 },
    { header: h.size, width: 8 },
    { header: h.print, width: 20 },
    { header: h.patches, width: 30 },
  ];
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", horizontal: "center" };

  // every distinct photo is fetched once
  const cache = new Map<string, Promise<number | null>>();
  const picture = (url: string) => {
    if (!cache.has(url)) cache.set(url, loadPicture(url, origin).then((buf) => (buf ? wb.addImage({ buffer: buf as unknown as ExcelJS.Buffer, extension: "jpeg" }) : null)));
    return cache.get(url)!;
  };
  const placements: Promise<void>[] = [];

  const slotBorder: Partial<ExcelJS.Borders> = { top: { style: "thin", color: { argb: "FFBFC5D2" } }, bottom: { style: "thin", color: { argb: "FFBFC5D2" } }, left: { style: "thin", color: { argb: "FFBFC5D2" } }, right: { style: "thin", color: { argb: "FFBFC5D2" } } };

  let lastOrder: number | null = null;
  for (const l of lines) {
    if (l.order_number !== lastOrder) {
      const head = ws.addRow([`${h.order}${l.order_number}`]);
      head.font = { bold: true, size: 13 };
      head.height = 22;
      lastOrder = l.order_number;
    }
    // one row per shirt: a line with qty 2 is two shirts for the supplier
    for (let n = 0; n < l.qty; n++) {
      const row = ws.addRow(["", ...Array(OWNER_PICTURE_SLOTS).fill(""), versionText(l, lang), l.size, printText(l), patchesText(l, lang)]);
      row.height = PX * 0.75 + 12; // points
      row.alignment = { vertical: "middle", wrapText: true };
      for (let c = 1; c <= 1 + OWNER_PICTURE_SLOTS; c++) row.getCell(c).border = slotBorder; // picture cells, the owner's 3 included
      row.getCell(2 + OWNER_PICTURE_SLOTS + 1).font = { bold: true }; // size
      row.getCell(2 + OWNER_PICTURE_SLOTS + 2).font = { bold: true }; // name#number
      if (l.photo) {
        const at = row.number;
        placements.push(picture(l.photo).then((img) => {
          if (img !== null) ws.addImage(img, { tl: { col: 0.06, row: at - 1 + 0.06 }, ext: { width: PX, height: PX }, editAs: "oneCell" });
          else ws.getCell(at, 1).value = l.title;
        }));
      } else row.getCell(1).value = l.title;
    }
  }
  await Promise.all(placements);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
