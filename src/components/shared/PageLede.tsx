import Image from "next/image";
import { Breadcrumbs, type Crumb } from "@/components/shared/Breadcrumbs";

/**
 * The page hero every listing and static page opens with (redesign phase 2,
 * 2026-11-09). It used to be a quiet light "lede"; it is now the approved
 * homepage's little sibling: a full-bleed night-stadium band
 * (public/home/stadium.webp, the same Higgsfield plate as the home hero,
 * mirrored in RTL) with breadcrumbs, the gold eyebrow and rule, a big white
 * headline, the intro and an optional stat line (`children`).
 *
 * `art` puts one of the generated collection photos (public/home/cat-*.webp)
 * on the far side, faded into the band. Those carry real crests, so they are
 * never mirrored — only the plain stadium plate is.
 *
 * It renders inside <Wrap> on every page (that is where the pages call it),
 * and breaks out to the full viewport with .kv-bleed — so no page had to be
 * restructured to get a full-width band.
 */
export function PageLede({
  eyebrow,
  title,
  intro,
  crumbs,
  art,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  /** Breadcrumb trail after "Home". Defaults to just this page's title. */
  crumbs?: Crumb[];
  /** Optional photo for the far side of the band. */
  art?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="kv-pagehero kv-bleed">
      <Image
        src="/home/stadium.webp"
        alt=""
        fill
        sizes="100vw"
        className="kv-pagehero-plate"
        priority
      />
      {art ? (
        <div aria-hidden className="kv-pagehero-art">
          <Image src={art} alt="" fill sizes="(max-width: 900px) 100vw, 720px" className="object-cover" />
        </div>
      ) : null}
      <div aria-hidden className="kv-pagehero-shade" />
      <div className="relative mx-auto w-full max-w-page px-6 pt-7 pb-10 wide:pt-9 wide:pb-14">
        <Breadcrumbs items={crumbs ?? [{ label: title }]} tone="dark" />
        <span className="mono-eyebrow kv-flood-eyebrow kv-flood-eyebrow-rule mt-7 wide:mt-10">
          {eyebrow}
        </span>
        <h1 className="kv-pagehero-title mt-3">{title}</h1>
        {intro ? <p className="kv-pagehero-intro mt-4">{intro}</p> : null}
        {children ? <div className="mt-6 flex flex-wrap items-center gap-3">{children}</div> : null}
      </div>
    </header>
  );
}

/**
 * The `.sec-head` rule-and-eyebrow that separates home page sections, with an
 * optional link at the far inline end.
 */
export function SectionHead({
  eyebrow,
  action,
}: {
  eyebrow: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex items-baseline justify-between gap-4 border-t border-rule pt-6">
      <span className="mono-eyebrow font-bold">{eyebrow}</span>
      {action}
    </div>
  );
}

/** Narrow measure for the policy and about pages. */
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-10 wide:py-14">
      <div className="kv-panel kv-prose max-w-[78ch] p-6 wide:p-10">{children}</div>
    </div>
  );
}

export function ProseHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[19px] first:mt-0">{children}</h2>;
}

export function ProseParagraph({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

/** The mockup's page wrapper: 1180px, 28px inline padding. */
export function Wrap({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-page px-6 ${className ?? ""}`}>{children}</div>
  );
}
