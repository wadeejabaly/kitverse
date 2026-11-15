"use client";

import { useEffect } from "react";
import { markOwnerDevice } from "@/lib/analytics/owner-device";

/** Every admin page view re-marks this browser as the owner's, so his own visits to the
 *  shop never count as visitors (see src/lib/analytics/owner-device.ts). Renders nothing. */
export function MarkOwnerDevice() {
  useEffect(() => { markOwnerDevice(true); }, []);
  return null;
}
