
/**
 * Supplier album access. Photos are NEVER sent from here directly - every photo goes through
 * the quality gate in photo-qa.ts (no Chinese labels, watermarks or ugly shots reach customers).
 */
const SUPPLIER = "https://jerseyxie.x.yupoo.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

/** Up to `max` photo hashes from a supplier album page (front, back, details...). */
export async function albumPhotoHashes(albumId: string, max = 6): Promise<string[]> {
  const res = await fetch(`${SUPPLIER}/albums/${albumId}?uid=1`, { headers: { "User-Agent": UA, Referer: `${SUPPLIER}/` } });
  if (!res.ok) throw new Error(`supplier album ${albumId}: ${res.status}`);
  return parseAlbumPhotos(await res.text(), albumId).slice(0, max);
}

/** Only photos that belong to THIS album (the page also shows other albums' covers and share links). Pure. */
export function parseAlbumPhotos(html: string, albumId: string): string[] {
  const own = [...html.matchAll(/data-path="\/jerseyxie\/([0-9a-f]{6,})\/[^"]*"[^>]*?data-album-id="(\d+)"|data-album-id="(\d+)"[^>]*?data-path="\/jerseyxie\/([0-9a-f]{6,})\//g)]
    .map((m) => ({ hash: m[1] ?? m[4], album: m[2] ?? m[3] })).filter((x) => x.album === albumId).map((x) => x.hash);
  return [...new Set(own)];
}
