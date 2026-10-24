"use client";

import { useTranslations } from "next-intl";
import { useConsent } from "@/components/providers/ConsentProvider";

/** Footer "cookie settings" link — reopens the consent banner. */
export function CookieSettingsButton() {
  const t = useTranslations("footer");
  const { openSettings } = useConsent();

  return (
    <button
      type="button"
      onClick={openSettings}
      className="underline-offset-4 transition-colors hover:text-ink hover:underline"
    >
      {t("cookieSettings")}
    </button>
  );
}
