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
    "flex-1 rounded-[6px] px-5 py-2.5 text-sm font-semibold transition-colors sm:flex-none sm:px-8";
  // Redesign 2026-11-09 (reference screenshots): the accept face is the
  // site's --electric blue (its ink is 5.5:1+ in both colour schemes), decline a plain outlined
  // button of the same size. Equal weight to click, as above.
  const acceptClasses =
    baseButton + " border border-transparent bg-electric text-accent-ink hover:opacity-90";
  const declineClasses =
    baseButton + " border border-rule bg-ground text-ink hover:border-ink focus-visible:border-ink";

  return (
    <aside
      // Held back while the home page film plays (globals.css, THE VIDEO HERO).
      data-consent-banner
      role="region"
      aria-label={t("settingsTitle")}
      className="fixed bottom-0 start-0 end-0 z-50 p-3 sm:p-6"
    >
      {/* rounded-[Npx], not rounded-2xl: --radius-2xl is flattened to 0px
          sitewide, so the token utility would silently do nothing. */}
      <div className="mx-auto flex max-w-4xl flex-col gap-4 rounded-[12px] border border-rule bg-ground p-4 shadow-[0_18px_50px_-20px_rgb(0_0_0/0.45)] sm:flex-row sm:items-center sm:gap-6 sm:px-7 sm:py-5">
        <div className="flex grow items-start gap-4 sm:items-center">
          {/* A plain hand-drawn cookie glyph, decorative. */}
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            className="mt-0.5 size-8 shrink-0 text-ink sm:mt-0 sm:size-9"
          >
            <path
              d="M21 12.5A9 9 0 1 1 11.5 3a3 3 0 0 0 3.5 3.5 3 3 0 0 0 3.5 3.5 2.5 2.5 0 0 0 2.5 2.5Z"
              strokeLinejoin="round"
            />
            <circle cx="8.5" cy="10" r="1" fill="currentColor" stroke="none" />
            <circle cx="12" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="7.5" cy="15" r="0.8" fill="currentColor" stroke="none" />
            <circle cx="16" cy="13.5" r="0.8" fill="currentColor" stroke="none" />
          </svg>
          <p className="text-[13px] leading-relaxed text-ink-soft sm:text-sm">{t("message")}</p>
        </div>
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
