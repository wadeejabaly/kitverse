"use client";

import { createContext, useContext, useState } from "react";
import type { Sleeve } from "@/data/types";

/**
 * The one piece of state <ProductGallery> and <ProductForm> share, even
 * though they sit in two different columns of the PDP (src/app/[locale]/
 * product/[handle]/page.tsx) with no other parent in common below the page
 * itself. A context is the minimal fix for that: the page (a server
 * component) just wraps both columns in <ProductSleeveProvider>, and each
 * leaf reads/writes the one value through useProductSleeve() instead of
 * owning its own local state.
 *
 * Picking "Long sleeve" is what lets the gallery swap to the product's
 * `imagesLongSleeve` set, once a shirt has one — see ProductGallery.
 */
const ProductSleeveContext = createContext<
  [Sleeve, (sleeve: Sleeve) => void] | null
>(null);

export function ProductSleeveProvider({ children }: { children: React.ReactNode }) {
  const state = useState<Sleeve>("short");
  return (
    <ProductSleeveContext.Provider value={state}>
      {children}
    </ProductSleeveContext.Provider>
  );
}

export function useProductSleeve(): [Sleeve, (sleeve: Sleeve) => void] {
  const context = useContext(ProductSleeveContext);
  if (!context) {
    throw new Error("useProductSleeve must be used inside <ProductSleeveProvider>");
  }
  return context;
}
