"use client";

import { useTranslations } from "next-intl";
import { useConsent } from "@/components/providers/ConsentProvider";

/**
 * Cookie-consent banner. Quiet bottom card, tokens only, with EQUAL-WEIGHT
 * Accept/Decline: declining is one click and looks exactly as inviting as
 * accepting — never a dark pattern. Reopens from the footer "cookie settings"
 * link. Restyle freely; the behavior contract stays.
 */
export function ConsentBanner() {
  const t = useTranslations("consent");
  const { consent, ready, settingsOpen, accept, decline } = useConsent();

  const visible = ready && (consent === "unknown" || settingsOpen);
  if (!visible) return null;

  const buttonClasses =
    "flex-1 border border-rule bg-ground px-5 py-2.5 text-sm transition-colors " +
    "hover:border-ink focus-visible:border-ink sm:flex-none sm:px-7";

  return (
    <aside
      role="region"
      aria-label={t("settingsTitle")}
      className="fixed bottom-0 start-0 end-0 z-50 p-4 sm:p-6"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-4 border border-rule bg-ground p-5 shadow-sm sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <p className="grow text-sm leading-relaxed text-ink-soft">
          {t("message")}
        </p>
        <div className="flex shrink-0 gap-3">
          <button type="button" onClick={accept} className={buttonClasses}>
            {t("accept")}
          </button>
          <button type="button" onClick={decline} className={buttonClasses}>
            {t("decline")}
          </button>
        </div>
      </div>
    </aside>
  );
}
