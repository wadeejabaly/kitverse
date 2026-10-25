/**
 * Applies photos picked by eye from scripts/photo-sheets.ts (no AI calls).
 *   npx tsx --conditions=react-server scripts/apply-photo-picks.ts <sheets-dir>
 * <sheets-dir>/picks.json: { "R12": 3, "R13": 0, ... } - photo number in that row, 0 = none usable.
 * A pick becomes the product's photo (photo_status "owner_upload" = chosen by a person, never
 * replaced automatically). 0 = no usable supplier photo: the site shows the placeholder and the
 * bot sends no photo.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const dir = process.argv[2];
  const { db } = await import("../src/lib/db");
  const { fetchBuffer, upload, record } = await import("../src/lib/catalog/photo-qa");
  const rows = JSON.parse(readFileSync(`${dir}/index.json`, "utf8")) as { label: string; handle: string; hashes: string[] }[];
  const picks = JSON.parse(readFileSync(`${dir}/picks.json`, "utf8")) as Record<string, number>;
  let set = 0, cleared = 0;
  for (const r of rows) {
    const n = picks[r.label];
    if (n === undefined) continue;
    const p = (await db().from("products").select("id").eq("handle", r.handle).single()).data!;
    if (!n) {
      await db().from("products").update({ photo_status: "none_clean", primary_image_url: null }).eq("id", p.id);
      cleared++; continue;
    }
    const hash = r.hashes[n - 1];
    const buf = await fetchBuffer(`https://photo.yupoo.com/jerseyxie/${hash}/big.jpg`, true);
    if (!buf) { console.log(`! could not download ${r.label} ${r.handle}`); continue; }
    const url = await upload(`products/${r.handle}/pick-${hash}.jpg`, buf);
    await record(p.id, url, "good", null, { source: "supplier", hash });
    await db().from("products").update({ photo_status: "owner_upload", primary_image_url: url }).eq("id", p.id);
    set++;
  }
  console.log(`${set} photos set, ${cleared} shirts without a usable supplier photo`);
}
main().catch((e) => { console.error(e); process.exit(1); });
