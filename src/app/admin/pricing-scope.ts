/**
 * Owner decision 2026-10-25: two delivery tiers. North (through Kfar Qara) is cheaper;
 * everywhere else - center, Negev, Jerusalem, the West Bank and Eilat - is the same higher fee.
 *
 * Deliberately NOT in pricing-actions.ts: that file is "use server", and a "use server" file may
 * only export async functions - exporting this plain object broke the Vercel build the same way
 * CATALOG_SCOPE did (see catalog-scope.ts).
 */
export const DELIVERY_FEES = { north: 50, rest: 70 } as const;

export interface DeliveryFeesPreview {
  version: number;
  status: string;
  zones: { id: string; label: string; currentFee: number; newFee: number; changes: boolean }[];
}
