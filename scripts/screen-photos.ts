/**
 * Screen product photos with the quality gate (no labels, watermarks, kids/baby items, ugly shots).
 *   npm run photos:screen -- --featured          featured shirts (website + most asked)
 *   npm run photos:screen -- --reset --featured  forget earlier decisions first
 *   npm run photos:screen -- --recheck-featured  re-check the website shirts' chosen photos with the latest rules (e.g. no shorts)
 * Costs ~$0.002-0.004 per photo checked (small vision model).
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const { db } = await import("../src/lib/db");
  const { bestProductPhoto } = await import("../src/lib/catalog/photo-qa");
  const reset = process.argv.includes("--reset");
  if (reset) {
    await db().from("product_images").delete().neq("status", "never");
    await db().from("products").update({ photo_status: "unchecked" }).neq("photo_status", "owner_upload");
    // drop supplier-derived main photos (keep the old site's cleaned ones - they get re-checked)
    await db().from("products").update({ primary_image_url: null }).not("primary_image_url", "like", "%/cleaned.jpg").neq("photo_status", "owner_upload");
    console.log("reset photo decisions");
  }
  if (process.argv.includes("--recheck-featured")) {
    // earlier assessments are kept and reused only if they already answer the newest questions
    await db().from("products").update({ photo_status: "unchecked", primary_image_url: null }).eq("status", "featured").eq("photo_status", "good");
    console.log("website shirts marked for a re-check");
  }
  let q = db().from("products").select("id,handle,title_en,primary_image_url,supplier_cover,photo_status").eq("photo_status", "unchecked");
  if (process.argv.includes("--featured") || process.argv.includes("--recheck-featured")) q = q.eq("status", "featured");
  const { data } = await q.limit(2000);
  const list = data ?? [];
  console.log(`screening ${list.length} products`);
  let good = 0, none = 0;
  const queue = [...list];
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const url = await bestProductPhoto(p).catch((e) => { console.log(`! ${p!.title_en}: ${(e as Error).message.slice(0, 80)}`); return undefined; });
      if (url) good++; else if (url === null) { none++; console.log(`no clean photo: ${p.title_en}`); }
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  console.log(`done: ${good} with a clean photo, ${none} without (owner can upload one)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
