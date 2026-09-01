import { notFound } from "next/navigation";

/**
 * Catch-all for unknown paths under a valid locale — routes them to the
 * branded [locale]/not-found.tsx (which then renders with the correct
 * lang/dir + layout). Without this, unmatched paths would fall through to
 * an unbranded framework 404.
 */
export default function CatchAllNotFound(): never {
  notFound();
}
