import { createNavigation } from "next-intl/navigation";
import { routing } from "./config";

/**
 * Locale-aware navigation primitives. ALWAYS import Link/redirect/usePathname/
 * useRouter from here — next/link would drop the locale prefix.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
