/**
 * Contact sheets for picking website photos by eye (no AI calls): one row per website shirt with
 * every photo from its supplier album(s), numbered. A person (or Claude in a chat) looks at the
 * sheets and writes picks; scripts/apply-photo-picks.ts applies them.
 *   npx tsx --conditions=react-server scripts/photo-sheets.ts <out-dir> [--only-placeholder]
 * Writes <out-dir>/sheet-NN.jpg and <out-dir>/index.json ({ row label -> handle, photo hashes }).
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const PER_SHEET = 8, PER_ROW = 6, T = 220, LABEL = 170;

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("usage: photo-sheets.ts <out-dir>");
  mkdirSync(out, { recursive: true });
  const sharp = (await import("sharp")).default;
  const { db } = await import("../src/lib/db");
  const { albumPhotoHashes } = await import("../src/lib/catalog/images");
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36";

  const products = ((await db().from("products")
    .select("id,handle,title_en,photo_status,options:product_options(audience,version,sleeve,supplier_album_ids)")
    .eq("status", "featured").in("photo_status", ["good", "unchecked"]).order("handle").limit(1000)).data ?? []) as unknown as
    { id: string; handle: string; title_en: string; photo_status: string; options: { audience: string; sleeve: string; supplier_album_ids: string[] }[] }[];

  // shirts with real owner/partner photos in the selection (e.g. Real Madrid) don't need a supplier photo
  const real = new Set((JSON.parse(readFileSync("catalog/store-selection.json", "utf8")).products as { image: string; productHandle?: string; handle: string }[])
    .filter((s) => !s.image.includes("_placeholder")).map((s) => s.productHandle ?? s.handle));
  const rows: { label: string; handle: string; title: string; hashes: string[] }[] = [];
  for (const p of products) {
    if (real.has(p.handle)) continue;
    const albums = p.options.filter((o) => o.audience !== "kids").sort((a, b) => (a.sleeve === "short" ? 0 : 1) - (b.sleeve === "short" ? 0 : 1)).flatMap((o) => o.supplier_album_ids);
    const hashes: string[] = [];
    for (const a of [...new Set(albums)].slice(0, 2)) {
      for (const h of await albumPhotoHashes(a, 8).catch(() => [] as string[])) if (!hashes.includes(h)) hashes.push(h);
      if (hashes.length >= PER_ROW) break;
    }
    if (!hashes.length) continue;
    rows.push({ label: `R${rows.length + 1}`, handle: p.handle, title: p.title_en, hashes: hashes.slice(0, PER_ROW) });
  }

  const thumb = async (hash: string) => {
    const res = await fetch(`https://photo.yupoo.com/jerseyxie/${hash}/medium.jpg`, { headers: { "User-Agent": UA, Referer: "https://jerseyxie.x.yupoo.com/" } }).catch(() => null);
    const buf = res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
    return buf ? sharp(buf).resize(T, T, { fit: "contain", background: "#ffffff" }).jpeg().toBuffer().catch(() => null) : null;
  };
  const esc = (s: string) => s.replace(/[<&>]/g, "");
  for (let s = 0; s * PER_SHEET < rows.length; s++) {
    const chunk = rows.slice(s * PER_SHEET, (s + 1) * PER_SHEET);
    const W = LABEL + PER_ROW * (T + 6), H = chunk.length * (T + 26);
    const layers: { input: Buffer; left: number; top: number }[] = [];
    for (const [i, r] of chunk.entries()) {
      const top = i * (T + 26);
      layers.push({ input: Buffer.from(`<svg width="${LABEL}" height="${T}"><text x="6" y="30" font-size="26" font-family="Arial" font-weight="bold" fill="#000">${r.label}</text>${esc(r.title).match(/.{1,18}(\s|$)/g)!.slice(0, 6).map((l, k) => `<text x="6" y="${60 + k * 22}" font-size="16" font-family="Arial" fill="#333">${l}</text>`).join("")}</svg>`), left: 0, top });
      for (const [j, h] of r.hashes.entries()) {
        const t = await thumb(h);
        if (t) layers.push({ input: t, left: LABEL + j * (T + 6), top });
        layers.push({ input: Buffer.from(`<svg width="${T}" height="24"><text x="4" y="18" font-size="18" font-family="Arial" font-weight="bold" fill="#c00">${j + 1}</text></svg>`), left: LABEL + j * (T + 6), top: top + T });
      }
    }
    await sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } }).composite(layers).jpeg({ quality: 82 }).toFile(`${out}/sheet-${String(s + 1).padStart(2, "0")}.jpg`);
  }
  writeFileSync(`${out}/index.json`, JSON.stringify(rows, null, 1));
  console.log(`${rows.length} shirts on ${Math.ceil(rows.length / PER_SHEET)} sheets in ${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
