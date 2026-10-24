import "server-only";
import { db, must } from "../db";

export const STATUS_FLOW = ["confirmed", "paid", "in_supplier_batch", "produced", "at_warehouse", "with_courier", "delivered"] as const;

export const STATUS_LABEL: Record<string, [string, string]> = {
  draft: ["مسودة", "Draft"], quoted: ["عرض سعر", "Quoted"], awaiting_details: ["بانتظار التفاصيل", "Awaiting details"],
  awaiting_confirmation: ["بانتظار التأكيد", "Awaiting confirmation"], confirmed: ["مؤكدة", "Confirmed"], paid: ["مدفوعة", "Paid"],
  in_supplier_batch: ["عند المورد", "At supplier"], produced: ["جاهزة بالمصنع", "Produced"], at_warehouse: ["وصلت المخزن", "At warehouse"],
  with_courier: ["مع التوصيل", "With courier"], delivered: ["وصلت", "Delivered"], cancelled: ["ملغية", "Cancelled"], issue: ["مشكلة", "Issue"],
};

/** Optional message to the customer when the owner moves an order forward (owner's wording). */
export const STATUS_MESSAGE: Record<string, string> = {
  produced: "سلامات 🙏 طلبيتك جاهزة بالمصنع وعالطريق لعنا",
  at_warehouse: "سلامات خيا، الطلبية وصلت لعنا وبتطلع للتوصيل بالأيام القريبة 🙏",
  with_courier: "الطلبية صارت عند شركة التوصيل، الشليح رح يتصل فيك قبل ما يوصل 🙏",
};

export interface BatchLine {
  order_number: number; customer: string; town: string; team: string; title: string; season: string; kit: string;
  version: string; sleeve: string; audience: string; size: string; qty: number; print_name: string; print_number: string;
  patches: string; box: string; supplier_album: string;
}

/** Rows for the supplier spreadsheet (one row per shirt line). */
export async function batchLines(orderIds: string[]): Promise<BatchLine[]> {
  if (!orderIds.length) return [];
  const orders = must(await db().from("orders").select("id,number,address").in("id", orderIds), "orders") as { id: string; number: number; address: Record<string, string> | null }[];
  const items = must(await db().from("order_items").select("order_id,product_id,audience,version,sleeve,size,qty,print_name,print_number,patches,box").in("order_id", orderIds), "items") as
    { order_id: string; product_id: string | null; audience: string; version: string; sleeve: string; size: string; qty: number; print_name: string | null; print_number: string | null; patches: string[]; box: boolean }[];
  const pids = [...new Set(items.map((i) => i.product_id).filter(Boolean))] as string[];
  const products = pids.length ? must(await db().from("products").select("id,title_en,season,kit,team:teams(name_en),options:product_options(audience,version,sleeve,supplier_album_ids)").in("id", pids), "products") as unknown as
    { id: string; title_en: string; season: string | null; kit: string; team: { name_en: string }; options: { audience: string; version: string; sleeve: string; supplier_album_ids: string[] }[] }[] : [];
  return items.map((i) => {
    const o = orders.find((x) => x.id === i.order_id)!;
    const p = products.find((x) => x.id === i.product_id);
    const album = p?.options.find((x) => x.audience === i.audience && x.version === i.version && x.sleeve === i.sleeve)?.supplier_album_ids[0];
    return {
      order_number: o.number, customer: o.address?.full_name ?? "", town: o.address?.town ?? "", team: p?.team.name_en ?? "",
      title: p?.title_en ?? "", season: p?.season ?? "", kit: p?.kit ?? "", version: i.version === "player" ? "Player" : "Fan",
      sleeve: i.sleeve === "long" ? "Long" : "Short", audience: i.audience, size: i.size, qty: i.qty, print_name: i.print_name ?? "",
      print_number: i.print_number ?? "", patches: i.patches.join(" + "), box: i.box ? "yes" : "",
      supplier_album: album ? `https://jerseyxie.x.yupoo.com/albums/${album}?uid=1` : "",
    };
  }).sort((a, b) => a.order_number - b.order_number);
}

export function toCsv(rows: BatchLine[]): string {
  const head = ["Order", "Customer", "Town", "Team", "Shirt", "Season", "Kit", "Version", "Sleeve", "Audience", "Size", "Qty", "Name", "Number", "Patches", "Box", "Supplier album"];
  const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = rows.map((r) => [r.order_number, r.customer, r.town, r.team, r.title, r.season, r.kit, r.version, r.sleeve, r.audience, r.size, r.qty, r.print_name, r.print_number, r.patches, r.box, r.supplier_album].map(esc).join(","));
  return "﻿" + [head.join(","), ...lines].join("\r\n"); // BOM so Excel shows Arabic correctly
}
