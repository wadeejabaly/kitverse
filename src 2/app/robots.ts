import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

/** Robots — the sitemap URL derives from getSiteUrl(), never a literal. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
