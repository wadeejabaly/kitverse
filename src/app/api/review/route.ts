import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getProduct } from "@/data/catalog";

/**
 * Dev-only API for the image review tool (src/app/review). Hard-gated below:
 * every handler 404s unless NODE_ENV === "development". Also excluded from
 * the i18n proxy matcher (src/proxy.ts) and never listed in the sitemap.
 *
 * Reads two vendored supplier data sets, kept out of the repo but on-disk
 * under this project's own vendor/ directory (see vendor/README.md):
 *   - vendor/data/albums.json (supplier album metadata, to find alternate
 *     photos for the same team+season+kit)
 *   - vendor/images-alt/<hash>.jpg (whitened candidate photos, streamed
 *     back to the swap panel)
 * This is safe ONLY because the route never runs outside development (the
 * gate below) and never runs in a deployed environment — reading arbitrary
 * absolute host paths from a request would be a real vulnerability in prod.
 */

const ROOT = process.cwd();
const PIPELINE_DATA = path.join(ROOT, "vendor", "data");
const ALBUMS_JSON = path.join(PIPELINE_DATA, "albums.json");
const SWAP_IMAGES_DIR = path.join(ROOT, "vendor", "images-alt");

const REVIEW_STATE_PATH = path.join(ROOT, "data", "review-state.json");
const PUBLIC_PRODUCTS_DIR = path.join(ROOT, "public", "products");

const HASH_RE = /^[0-9a-f]{6,16}$/;

/**
 * Route Handlers can't use next/navigation's notFound() (that's for Server
 * Components/Actions — it throws a redirect-style error the App Router
 * catches while rendering a page, which a route handler never does). Return
 * a plain 404 Response instead, and have every handler return it early.
 */
function devGate(): NextResponse | null {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }
  return null;
}

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function readReviewState(): Record<
  string,
  { state: "approved" | "rejected"; image?: string; at: string }
> {
  if (!existsSync(REVIEW_STATE_PATH)) return {};
  return JSON.parse(readFileSync(REVIEW_STATE_PATH, "utf8"));
}

/** Write review-state.json atomically: write to a temp file, then rename. */
function writeReviewStateAtomic(state: unknown) {
  const tmp = `${REVIEW_STATE_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  renameSync(tmp, REVIEW_STATE_PATH);
}

interface Album {
  league: string | null;
  albumId: string;
  cover: string;
  photos: number;
  raw: string;
  season: string;
  kit: string;
  version: string;
  audience: string;
  sleeve: string;
  type: string;
  flags: string[];
}

/**
 * Alternate-photo candidates for a product: other whitened files whose
 * supplier album matches the same team + season + kit — a "Jersey" (not
 * training wear), adult, short-sleeve album whose raw title mentions the
 * team, that isn't the product's current source photo, and that actually
 * exists in the whitened output directory.
 */
function findCandidates(handle: string) {
  const product = getProduct(handle);
  if (!product) return [];

  const albums: Album[] = JSON.parse(readFileSync(ALBUMS_JSON, "utf8"));
  const teamNeedle = stripDiacritics(product.team).toLowerCase();

  return albums
    .filter(
      (a) =>
        a.season === product.season &&
        a.kit === product.kit &&
        a.type === "Jersey" &&
        a.audience === "Adult" &&
        a.sleeve === "Short" &&
        a.cover !== product.sourceHash &&
        stripDiacritics(a.raw).toLowerCase().includes(teamNeedle),
    )
    .filter((a) => existsSync(path.join(SWAP_IMAGES_DIR, `${a.cover}.jpg`)))
    .map((a) => ({
      hash: a.cover,
      raw: a.raw,
      version: a.version,
      imageUrl: `/api/review?mode=image&hash=${encodeURIComponent(a.cover)}`,
    }));
}

export async function GET(request: NextRequest) {
  const gate = devGate();
  if (gate) return gate;

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");

  if (mode === "image") {
    const hash = searchParams.get("hash") ?? "";
    if (!HASH_RE.test(hash)) {
      return NextResponse.json({ error: "invalid hash" }, { status: 400 });
    }
    const file = path.join(SWAP_IMAGES_DIR, `${hash}.jpg`);
    if (!existsSync(file)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const bytes = readFileSync(file);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
    });
  }

  if (mode === "candidates") {
    const handle = searchParams.get("handle") ?? "";
    if (!handle) {
      return NextResponse.json({ error: "handle required" }, { status: 400 });
    }
    return NextResponse.json({ candidates: findCandidates(handle) });
  }

  // Default: the current review-state map (the client already has products
  // from the server component's initial props; this lets it refresh state
  // after a mutation without a full page reload).
  return NextResponse.json({ reviewState: readReviewState() });
}

const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), handle: z.string().min(1) }),
  z.object({ action: z.literal("reject"), handle: z.string().min(1) }),
  z.object({
    action: z.literal("swap"),
    handle: z.string().min(1),
    hash: z.string().regex(HASH_RE),
  }),
]);

export async function POST(request: NextRequest) {
  const gate = devGate();
  if (gate) return gate;

  const json = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const product = getProduct(input.handle);
  if (!product) {
    return NextResponse.json({ error: `unknown handle: ${input.handle}` }, { status: 404 });
  }

  const state = readReviewState();
  const today = new Date().toISOString().slice(0, 10);

  if (input.action === "approve") {
    state[input.handle] = { ...state[input.handle], state: "approved", at: today };
  } else if (input.action === "reject") {
    state[input.handle] = { ...state[input.handle], state: "rejected", at: today };
  } else {
    // swap: copy the chosen whitened candidate into public/products/<handle>.jpg
    // and record it as the image override, leaving approval state untouched
    // (a swap changes the photo; approving it is still a separate step).
    const src = path.join(SWAP_IMAGES_DIR, `${input.hash}.jpg`);
    if (!existsSync(src)) {
      return NextResponse.json({ error: `candidate image not found: ${input.hash}` }, { status: 404 });
    }
    const dest = path.join(PUBLIC_PRODUCTS_DIR, `${input.handle}.jpg`);
    writeFileSync(dest, readFileSync(src));
    state[input.handle] = {
      ...state[input.handle],
      image: `${input.hash}.jpg`,
      at: today,
    };
  }

  writeReviewStateAtomic(state);
  return NextResponse.json({ ok: true, handle: input.handle, entry: state[input.handle] });
}
