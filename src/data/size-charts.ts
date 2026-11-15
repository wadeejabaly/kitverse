import type { AdultSize } from "./types";
import { KIDS_SIZE_CHART } from "./pricing";

/**
 * Garment measurements for the size guide (owner request 2026-11-15: "I want all the measurements, for
 * the adults too"). Source: the supplier's own "📏Sizes Chart" album on jerseyxie.x.yupoo.com
 * (album 179636411), read 2026-11-15 - the "Adult Men Fans Version", "Adult Men Player Version" and
 * "Adult Men's Soccer Shorts" charts. Centimetres, measured flat; the supplier allows 1-2 cm either way.
 * Chest and waist are HALF measurements (straight across the garment laid flat).
 *
 * The supplier gives no Player measurements for 3XL/4XL and no shorts measurements above 2XL - those
 * stay null ("ask us") rather than guessed. Kids kits are KIDS_SIZE_CHART in pricing.ts (same album,
 * "KIDS Jersey Size Chart").
 *
 * The old size-guide table (chest 96-132 / length 68-80, from the September storefront mock-up) was not
 * the supplier's and is gone.
 */
export type Range = [number, number];

export type FanRow = {
  size: AdultSize;
  height: Range;
  weight: Range;
  length: number;
  chest: number;
  sleeve: number;
  cuff: number;
  sleeveLong: number;
};

export const FAN_CHART: FanRow[] = [
  { size: "S", height: [160, 170], weight: [60, 65], length: 71, chest: 50, sleeve: 36.5, cuff: 16.5, sleeveLong: 75.5 },
  { size: "M", height: [170, 175], weight: [66, 70], length: 73, chest: 52, sleeve: 38, cuff: 17.5, sleeveLong: 77 },
  { size: "L", height: [175, 180], weight: [71, 75], length: 75, chest: 54, sleeve: 39.5, cuff: 18.5, sleeveLong: 78.5 },
  { size: "XL", height: [180, 185], weight: [76, 80], length: 77, chest: 56, sleeve: 41, cuff: 19.5, sleeveLong: 80 },
  { size: "XXL", height: [185, 190], weight: [81, 87], length: 81, chest: 59, sleeve: 42, cuff: 20.5, sleeveLong: 81 },
  { size: "3XL", height: [190, 195], weight: [88, 95], length: 83, chest: 61, sleeve: 43, cuff: 21.5, sleeveLong: 82 },
  { size: "4XL", height: [190, 199], weight: [96, 105], length: 85, chest: 63, sleeve: 44, cuff: 22.5, sleeveLong: 83 },
];

export type PlayerRow = {
  size: AdultSize;
  height: Range | null;
  weight: Range | null;
  length: number | null;
  chest: number | null;
  shoulder: number | null;
  sleeve: number | null;
};

const none = { height: null, weight: null, length: null, chest: null, shoulder: null, sleeve: null };

export const PLAYER_CHART: PlayerRow[] = [
  { size: "S", height: [160, 165], weight: [55, 60], length: 70, chest: 46, shoulder: 40.5, sleeve: 24 },
  { size: "M", height: [165, 170], weight: [60, 70], length: 72, chest: 48, shoulder: 41.9, sleeve: 24.8 },
  { size: "L", height: [170, 175], weight: [70, 80], length: 74, chest: 50, shoulder: 43.3, sleeve: 25.6 },
  { size: "XL", height: [175, 185], weight: [80, 92.5], length: 76, chest: 52, shoulder: 44.7, sleeve: 26.4 },
  { size: "XXL", height: [185, 190], weight: [90, 95], length: 78, chest: 54, shoulder: 46.1, sleeve: 27.2 },
  { size: "3XL", ...none },
  { size: "4XL", ...none },
];

export type ShortsRow = { size: AdultSize; height: Range | null; weight: Range | null; waist: number | null; length: number | null };

export const SHORTS_CHART: ShortsRow[] = [
  { size: "S", height: [155, 165], weight: [55, 64], waist: 33, length: 45 },
  { size: "M", height: [163, 170], weight: [62, 70], waist: 34, length: 46 },
  { size: "L", height: [168, 175], weight: [68, 75], waist: 35, length: 49 },
  { size: "XL", height: [173, 180], weight: [73, 80], waist: 36, length: 51 },
  { size: "XXL", height: [178, 195], weight: [78, 110], waist: 37, length: 53 },
  { size: "3XL", height: null, weight: null, waist: null, length: null },
  { size: "4XL", height: null, weight: null, waist: null, length: null },
];

/** The player shirt is this much narrower across the chest (half chest, cm) than the fan shirt of the same size. */
export const PLAYER_NARROWER_CM = FAN_CHART[0].chest - PLAYER_CHART[0].chest!;

export { KIDS_SIZE_CHART };
