import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { getAllProducts } from "@/data/catalog";
import { ReviewApp } from "./ReviewApp";

/**
 * Dev-only image review tool. Products render on the storefront only once
 * approved here (src/data/catalog.ts's getVisibleProducts()). Hard-gated:
 * 404s outside development. Also excluded from src/proxy.ts's i18n matcher
 * and never added to src/app/sitemap.ts's route list.
 */
export default async function ReviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const products = getAllProducts();

  const reviewStatePath = path.join(process.cwd(), "data", "review-state.json");
  const reviewState = existsSync(reviewStatePath)
    ? JSON.parse(readFileSync(reviewStatePath, "utf8"))
    : {};

  return <ReviewApp initialProducts={products} initialReviewState={reviewState} />;
}
