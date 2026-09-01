/**
 * The `.lede` block from the mockup: mono eyebrow, large quiet headline, one
 * line of intro, closed by a hairline. Every listing and static page opens
 * with it, which is what keeps the pages feeling like one site.
 */
export function PageLede({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-rule pt-7 pb-8">
      <span className="mono-eyebrow">{eyebrow}</span>
      <h1 className="mt-2 mb-2.5 text-[clamp(1.7rem,3vw,2.4rem)] leading-tight">
        {title}
      </h1>
      {intro ? <p className="max-w-[56ch] text-ink-soft">{intro}</p> : null}
      {children}
    </div>
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
      <span className="mono-eyebrow">{eyebrow}</span>
      {action}
    </div>
  );
}

/** Narrow measure for the policy and about pages. */
export function Prose({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[62ch] pt-8 pb-16">{children}</div>;
}

export function ProseHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 mb-2.5 text-[17px]">{children}</h2>;
}

export function ProseParagraph({ children }: { children: React.ReactNode }) {
  return <p className="mb-3.5 text-ink-soft">{children}</p>;
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
