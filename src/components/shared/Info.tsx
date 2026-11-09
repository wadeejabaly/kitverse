/**
 * Building blocks for the information pages (redesign phase 2, 2026-11-09):
 * an icon card, an expandable question, a contact call-to-action panel and a
 * small icon set. Server components, no client JS — <details> does the
 * expanding natively, keyboard and screen reader included.
 */

export type IconName =
  | "truck"
  | "clock"
  | "map"
  | "phone"
  | "box"
  | "shield"
  | "ruler"
  | "shirt"
  | "card"
  | "chat"
  | "mail"
  | "return"
  | "star"
  | "camera";

const PATHS: Record<IconName, React.ReactNode> = {
  truck: (
    <>
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" strokeLinejoin="round" />
      <circle cx="7" cy="17.5" r="1.5" />
      <circle cx="17" cy="17.5" r="1.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" strokeLinecap="round" />
    </>
  ),
  map: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  phone: <path d="M6.5 3.5h3l1.5 4-2 1.3a10 10 0 0 0 5.2 5.2l1.3-2 4 1.5v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z" strokeLinejoin="round" />,
  box: (
    <>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" strokeLinejoin="round" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" strokeLinejoin="round" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6z" strokeLinejoin="round" />
      <path d="m8.8 12 2.2 2.2 4.2-4.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  ruler: (
    <>
      <rect x="2.5" y="8" width="19" height="8" rx="1.5" />
      <path d="M6.5 8v3M10 8v4M13.5 8v3M17 8v4" strokeLinecap="round" />
    </>
  ),
  shirt: <path d="M8 4 4 7l2.2 2.5L8 8v12h8V8l1.8 1.5L20 7l-4-3-2 1.5h-4L8 4Z" strokeLinejoin="round" />,
  card: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18M7 14.5h3" strokeLinecap="round" />
    </>
  ),
  chat: <path d="M4 5.5h16v10H9l-5 4z" strokeLinejoin="round" />,
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" strokeLinejoin="round" />
    </>
  ),
  return: (
    <>
      <path d="M9 8 5 12l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12h10a4 4 0 0 0 0-8h-2" strokeLinecap="round" />
    </>
  ),
  star: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" strokeLinejoin="round" />,
  camera: (
    <>
      <path d="M4 7.5h3.5L9 5.5h6l1.5 2H20v11H4z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.3" />
    </>
  ),
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

/** A white card with an icon tile, a bold title and body copy. */
export function InfoCard({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="kv-panel flex flex-col gap-3 p-6">
      <span className="kv-icon-tile">
        <Icon name={icon} />
      </span>
      <h3 className="text-[17px] font-extrabold">{title}</h3>
      <div className="text-[14.5px] leading-relaxed text-ink-soft">{children}</div>
    </div>
  );
}

/** One expandable question. */
export function Question({
  question,
  children,
  open = false,
}: {
  question: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open} className="kv-acc">
      <summary>
        {question}
        <span aria-hidden className="kv-acc-icon">
          <span />
          <span />
        </span>
      </summary>
      <div className="kv-acc-body max-w-[68ch]">{children}</div>
    </details>
  );
}

/** A section heading with the gold rule, used between blocks on info pages. */
export function InfoHeading({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div className="mb-6">
      {eyebrow ? <span className="mono-eyebrow kv-flood-eyebrow-rule mb-2.5">{eyebrow}</span> : null}
      <h2 className="kv-section-title">{title}</h2>
    </div>
  );
}

/** The dark "still need help?" panel that closes every info page. */
export function ContactPanel({
  title,
  body,
  emailLabel,
  instagramLabel,
}: {
  title: string;
  body: string;
  emailLabel: string;
  instagramLabel: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-[16px] bg-[var(--flood-ground)] px-6 py-9 text-white wide:px-10 wide:py-12">
      <div aria-hidden className="pointer-events-none absolute -end-20 -top-24 size-72 rounded-full bg-[#1f5cff]/30 blur-3xl" />
      <div className="relative flex flex-col gap-6 wide:flex-row wide:items-center wide:justify-between">
        <div>
          <span className="mono-eyebrow kv-flood-eyebrow kv-flood-eyebrow-rule">KitVerse</span>
          <h2 className="mt-3 text-[clamp(1.4rem,2.4vw,2rem)] font-extrabold">{title}</h2>
          <p className="mt-2 max-w-[52ch] text-white/75">{body}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href={`mailto:${CONTACT_EMAIL}`} className="btn">
            {emailLabel}
          </a>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-quiet !border-white/30 !text-white hover:!border-white"
          >
            {instagramLabel}
          </a>
        </div>
      </div>
    </div>
  );
}

/** The shop's public contact points, in one place. */
export const CONTACT_EMAIL = "kitversejerseys@gmail.com";
export const INSTAGRAM_HANDLE = "@kitversejerseys";
export const INSTAGRAM_URL = "https://www.instagram.com/kitversejerseys/";
