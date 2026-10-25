import "server-only";
import { db, must } from "../db";
import { resolveTeam } from "./teams";
import { normalizeSeason } from "../text";
import { notify } from "../notify";

/**
 * Daily: read the supplier's newest albums and add any new SHIRT albums to the catalog
 * (status "available" - the bot can sell them, the website doesn't show them until featured).
 * Mirrors the rules of tools/catalog-build (baby/training/jackets/shorts/other sports are skipped).
 */
const SUPPLIER = "https://jerseyxie.x.yupoo.com";
const NEW_ARRIVALS = 4717653;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

export interface ParsedAlbum {
  season: string | null; era: "current" | "retro"; kit: string; version: "fan" | "player"; sleeve: "short" | "long";
  audience: "adult" | "women" | "kids"; teamRaw: string; isShirt: boolean;
}

/** Same rules as the Python catalog builder (pure; unit-tested). */
export function parseAlbumTitle(rawTitle: string): ParsedAlbum {
  const t = rawTitle.replace(/(?<=[A-Za-z])-(?=[A-Za-z])/g, "").replace(/_/g, "/");
  const low = t.toLowerCase();
  const m = t.match(/\b(\d{2}|(?:19|20)\d{2})[-/](\d{2}|(?:19|20)\d{2})\b/) ?? null;
  const season = m ? normalizeSeason(`${m[1]}/${m[2]}`) : (t.match(/\b((?:19|20)\d{2})\b/)?.[1] ?? null);
  const year = season ? Number(season.slice(0, 4)) : null;
  const kit = /\bhome\b/.test(low) ? "Home" : /\baway\b/.test(low) ? "Away" : /\bthird\b/.test(low) ? "Third" : /\bfourth\b/.test(low) ? "Fourth"
    : /goalkeeper|\bgk\b/.test(low) ? "Goalkeeper" : /special|anniversary|commemorative|edition|concept|classic|icons|champion/.test(low) ? "Special" : "Unstated";
  const notShirt = /baby|training|pre-?match|warm ?up|tracksuit|\bsuit\b|jacket|windbreaker|hoodie|coat|sweater|pants|\bpolo\b|\bvest\b|socks|t-?shirts?\b|tshirt|nba|nfl|mlb|nhl|\bf1\b|rugby|springbok/.test(low);
  const isShirt = !notShirt && (/jers(r)?ey|shirt/.test(low) || kit !== "Unstated");
  const teamRaw = t
    .replace(/\b(Cheap|Soccer|Yupoo|Jerseys?|Jersrey|Mens|Men's)\b/gi, " ")
    .replace(/\b(\d{2}|(?:19|20)\d{2})[-/](\d{2}|(?:19|20)\d{2})\b|\b(?:19|20)\d{2}\b/g, " ")
    .replace(/^\s*Player Version\s*/i, "")
    .split(/\b(?:Home|Away|Third|Fourth|Goalkeeper|GK|Special|Player|Kids?|Retro|Training|Long|Women|Baby|Shorts|Polo|Anniversary|Edition|Commemorative|Concept|Classic|Terrace|Version|and|World Cup|Leaked|\d+(?:th|st|nd|rd))\b/i)[0]
    .replace(/\s+/g, " ").trim();
  return {
    season, era: /retro/.test(low) || (year !== null && year <= 2023) ? "retro" : "current", kit,
    version: /player/.test(low) ? "player" : "fan", sleeve: /long sleeve/.test(low) ? "long" : "short",
    audience: /\bkids?\b|children/.test(low) ? "kids" : /\bwomen|woman|ladies|female/.test(low) ? "women" : "adult",
    teamRaw, isShirt,
  };
}

async function page(n: number): Promise<{ id: string; title: string; cover: string }[]> {
  const res = await fetch(`${SUPPLIER}/categories/${NEW_ARRIVALS}?page=${n}`, { headers: { "User-Agent": UA, Referer: `${SUPPLIER}/` } });
  if (!res.ok) throw new Error(`supplier page ${n}: ${res.status}`);
  const html = await res.text();
  return [...html.matchAll(/class="album__main"\s+title="([^"]*)"\s+href="\/albums\/(\d+)[^"]*"[\s\S]*?src="https:\/\/photo\.yupoo\.com\/jerseyxie\/([0-9a-f]+)\//g)]
    .map((x) => ({ title: x[1].replace(/&amp;/g, "&").replace(/&#x27;/g, "'").trim(), id: x[2], cover: x[3] }));
}

export async function syncSupplierNewArrivals(pages = 3) {
  const albums = (await Promise.all(Array.from({ length: pages }, (_, i) => page(i + 1)))).flat();
  const knownRows = must(await db().from("product_options").select("supplier_album_ids").overlaps("supplier_album_ids", albums.map((a) => a.id)), "known albums") as { supplier_album_ids: string[] }[];
  const known = new Set(knownRows.flatMap((r) => r.supplier_album_ids));
  let added = 0, attached = 0;
  for (const a of albums) {
    if (known.has(a.id)) continue;
    const p = parseAlbumTitle(a.title);
    if (!p.isShirt || p.teamRaw.length < 3) continue;
    const team = (await resolveTeam(p.teamRaw))[0];
    if (!team || team.score < 0.85) continue;
    const kitKnown = !["Special", "Unstated"].includes(p.kit);
    let product = kitKnown && p.season
      ? (await db().from("products").select("id").eq("team_id", team.team.id).eq("season", p.season).eq("kit", p.kit).eq("era", p.era).limit(1).maybeSingle()).data
      : null;
    if (!product) {
      const label = p.kit === "Unstated" ? "Shirt" : p.kit === "Special" ? "Special Edition Shirt" : `${p.kit} Shirt`;
      const title = `${team.team.name_en} ${p.season ?? ""} ${p.era === "retro" ? "Retro " : ""}${label}`.replace(/\s+/g, " ").trim();
      const handle = `${title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${a.id}`;
      product = must(await db().from("products").insert({
        handle, team_id: team.team.id, season: p.season, kit: p.kit, era: p.era, title_en: title, status: "available",
        flags: ["added by daily supplier sync - check name/photo"], supplier_primary_album: a.id, supplier_cover: a.cover,
      }).select("id").single(), "new product") as { id: string };
      added++;
    }
    const opt = (await db().from("product_options").select("id,supplier_album_ids").eq("product_id", product.id).eq("audience", p.audience).eq("version", p.version).eq("sleeve", p.sleeve).maybeSingle()).data;
    if (opt) await db().from("product_options").update({ supplier_album_ids: [...new Set([...opt.supplier_album_ids, a.id])] }).eq("id", opt.id);
    else await db().from("product_options").insert({ product_id: product.id, audience: p.audience, version: p.version, sleeve: p.sleeve, supplier_album_ids: [a.id] });
    attached++;
  }
  if (added) await notify({ kind: "catalog.supplier_new", priority: "quiet", title: `${added} new shirts added from the supplier`, link: "/admin" });
  return { scanned: albums.length, newAlbums: attached, newProducts: added };
}
