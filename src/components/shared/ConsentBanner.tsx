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

  // Equal size and equal ease of click either way — see the component's own
  // note: declining must stay exactly as easy as accepting. Only the FACE
  // changed (owner reference 2026-10-27): a filled accent "accept" against
  // a plain outlined "decline", not a colour difference in how hard either
  // is to hit.
  const baseButton =
    "flex-1 px-5 py-2.5 text-sm font-medium transition-colors sm:flex-none sm:px-7";
  const acceptClasses =
    baseButton + " border border-transparent bg-accent text-accent-ink hover:opacity-90";
  const declineClasses =
    baseButton + " border border-rule bg-ground hover:border-ink focus-visible:border-ink";

  return (
    <aside
      role="region"
      aria-label={t("settingsTitle")}
      className="fixed bottom-0 start-0 end-0 z-50 p-4 sm:p-6"
    >
      {/* rounded-[Npx], not rounded-2xl: --radius-2xl is flattened to 0px
          sitewide, so the token utility would silently do nothing — see
          CategoryGrid.tsx's own note on the same bracket-value escape
          hatch for this spec's rounded-corners ask. */}
      <div className="mx-auto flex max-w-2xl flex-col gap-4 rounded-[16px] border border-rule bg-ground p-5 shadow-lg sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <p className="grow text-sm leading-relaxed text-ink-soft">
          {t("message")}
        </p>
        <div className="flex shrink-0 gap-3">
          <button type="button" onClick={accept} className={acceptClasses}>
            {t("accept")}
          </button>
          <button type="button" onClick={decline} className={declineClasses}>
            {t("decline")}
          </button>
        </div>
      </div>
    </aside>
  );
}
