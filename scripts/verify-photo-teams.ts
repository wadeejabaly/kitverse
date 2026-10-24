/**
 * Re-check the team crest on every chosen product photo with the strong model; photos of the
 * wrong team are marked bad and their product is re-screened next run.
 *   npm run photos:verify-teams -- --featured
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const { db } = await import("../src/lib/db");
  const { assessPhoto } = await import("../src/lib/catalog/photo-qa");
  let q = db().from("products").select("id,title_en,primary_image_url,team:teams(name_en,type)").eq("photo_status", "good").not("primary_image_url", "is", null);
  if (process.argv.includes("--featured")) q = q.eq("status", "featured");
  const rows = ((await q.limit(2000)).data ?? []) as unknown as { id: string; title_en: string; primary_image_url: string; team: { name_en: string; type: string } }[];
  console.log(`verifying ${rows.length} photos`);
  let wrong = 0;
  const queue = [...rows];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const expected = `a ${p.team.name_en} ${p.team.type === "national" ? "national team " : ""}football shirt`;
      const a = await assessPhoto(p.primary_image_url, expected).catch(() => null);
      if (a?.matches_expected === false) {
        wrong++;
        console.log(`wrong team: ${p.title_en}`);
        await db().from("product_images").update({ status: "bad", quality: a }).eq("product_id", p.id).eq("url", p.primary_image_url);
        await db().from("products").update({ photo_status: "unchecked", primary_image_url: null }).eq("id", p.id);
      } else if (a) {
        await db().from("product_images").update({ quality: a }).eq("product_id", p.id).eq("url", p.primary_image_url);
      }
    }
  }));
  console.log(`done: ${wrong} wrong-team photos removed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
