"use client";

import { useEffect, useState } from "react";

/**
 * Picks which site banner to show by the shopper's clock (owner request 2026-11-12, Black Friday):
 * the dated sale strip between its start and end, otherwise the welcome strip. The page is static, so
 * the server renders the choice as of build time and this corrects it after load - the sale banner
 * turns on and off on time without a deploy. Checkout enforces the code's dates on its own.
 */
export function PromoSwitch({
  welcome,
  sale,
  startsAt,
  endsAt,
  saleAtBuild,
}: {
  welcome: React.ReactNode;
  sale: React.ReactNode;
  startsAt: string | null;
  endsAt: string | null;
  saleAtBuild: boolean;
}) {
  const [onSale, setOnSale] = useState(saleAtBuild);
  useEffect(() => {
    if (!startsAt || !endsAt) return;
    const check = () => {
      const now = Date.now();
      setOnSale(now >= Date.parse(startsAt) && now < Date.parse(endsAt));
    };
    check();
    const timer = window.setInterval(check, 60_000);
    return () => window.clearInterval(timer);
  }, [startsAt, endsAt]);
  return <>{onSale ? sale : welcome}</>;
}
