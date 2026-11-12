import "server-only";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { patchArt, PATCH_SUPPLIER_WORDS } from "@/data/patches";
import type { PatchId } from "@/lib/orders/rules";
import type { BatchLine } from "./admin";

/**
 * The supplier's picture sheet (owner request 2026-11-12). The supplier is Chinese and reads pictures,
 * not paragraphs, so this mirrors the sheet he sends back himself: an order-number row, then ONE ROW PER
 * SHIRT - shirt photo, Fan/Player, size, NAME#NUMBER, a photo of each patch. Words only where a picture
 * can't say it (long sleeve, kids, the Champions League full set, a patch we have no art for).
 */

export const MAX_PATCH_COLUMNS = 3;

/** "Player" / "Fan", plus LONG SLEEVE / KIDS / WOMEN only when it isn't the usual adult short sleeve. */
export function versionText(l: Pick<BatchLine, "version" | "sleeve" | "audience">): string {
  return [l.version, l.sleeve === "Long" ? "LONG SLEEVE" : "", l.audience === "kids" ? "KIDS" : l.audience === "women" ? "WOMEN" : ""].filter(Boolean).join(" ");
}

/** "OLISE#11", "OLISE", "#11" or "" - the supplier's own format. */
export function printText(l: Pick<BatchLine, "print_name" | "print_number">): string {
  const name = l.print_name.trim().toUpperCase();
  const num = l.print_number.trim();
  return num ? `${name}#${num}` : name;
}

export interface SheetPatch { id: string; art: string | null; words: string }

/** Each patch on the line with its picture (or null) and the few words for it. */
export function linePatches(l: Pick<BatchLine, "patch_ids" | "team_id" | "league_id">): SheetPatch[] {
  return l.patch_ids.map((id) => ({
    id,
    art: patchArt(id as PatchId, { teamSlug: l.team_id, leagueId: l.league_id }),
    words: PATCH_SUPPLIER_WORDS[id as PatchId] ?? id.toUpperCase(),
  }));
}

/** Words for the note column: patches that need them (no art, or the full set) + gift box. */
export function noteText(l: Pick<BatchLine, "patch_ids" | "team_id" | "league_id" | "box">): string {
  const words = linePatches(l).filter((p) => !p.art || p.id === "champions_league_full").map((p) => p.words);
  if (l.box) words.push("GIFT BOX");
  return words.join(" / ");
}

/** The short caption for sending one shirt on WhatsApp: "Player XL OLISE#11". */
export function captionText(l: BatchLine): string {
  return [versionText(l), l.size, printText(l), noteText(l)].filter(Boolean).join("  ");
}

const PX = 84; // picture size in the sheet

async function loadPicture(url: string, origin: string): Promise<Buffer | null> {
  try {
    const res = await fetch(new URL(url, origin), { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    return await sharp(input).resize(PX * 2, PX * 2, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
  } catch {
    return null;
  }
}

/** Builds the .xlsx. `origin` resolves the site-relative photo paths (/products/..., /patches/...). */
export async function buildSupplierSheet(lines: BatchLine[], origin: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Batch", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Photo", width: 14 },
    { header: "Version", width: 16 },
    { header: "Size", width: 8 },
    { header: "Name#Number", width: 20 },
    ...Array.from({ length: MAX_PATCH_COLUMNS }, (_, i) => ({ header: `Patch ${i + 1}`, width: 14 })),
    { header: "Note", width: 26 },
  ];
  ws.getRow(1).font = { bold: true };

  // every distinct picture is fetched once
  const cache = new Map<string, Promise<number | null>>();
  const picture = (url: string | null) => {
    if (!url) return Promise.resolve(null);
    if (!cache.has(url)) cache.set(url, loadPicture(url, origin).then((buf) => (buf ? wb.addImage({ buffer: buf as unknown as ExcelJS.Buffer, extension: "jpeg" }) : null)));
    return cache.get(url)!;
  };

  const placements: Promise<void>[] = [];
  const place = (url: string | null, row: number, col: number) =>
    placements.push(picture(url).then((img) => {
      if (img !== null) ws.addImage(img, { tl: { col: col + 0.08, row: row - 1 + 0.06 }, ext: { width: PX, height: PX }, editAs: "oneCell" });
    }));

  let lastOrder: number | null = null;
  for (const l of lines) {
    if (l.order_number !== lastOrder) {
      const head = ws.addRow([`#${l.order_number}`]);
      head.font = { bold: true, size: 13 };
      head.height = 22;
      lastOrder = l.order_number;
    }
    const patches = linePatches(l);
    // one row per shirt: a line with qty 2 is two shirts for the supplier
    for (let n = 0; n < l.qty; n++) {
      const row = ws.addRow(["", versionText(l), l.size, printText(l), ...Array(MAX_PATCH_COLUMNS).fill(""), noteText(l)]);
      row.height = PX * 0.75 + 10; // points
      row.alignment = { vertical: "middle", wrapText: true };
      row.getCell(3).font = { bold: true };
      row.getCell(4).font = { bold: true };
      if (l.photo) place(l.photo, row.number, 0);
      else row.getCell(1).value = l.title;
      patches.slice(0, MAX_PATCH_COLUMNS).forEach((p, i) => {
        if (p.art) place(p.art, row.number, 4 + i);
        else row.getCell(5 + i).value = p.words;
      });
    }
  }
  await Promise.all(placements);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
