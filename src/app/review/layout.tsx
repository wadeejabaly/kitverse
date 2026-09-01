import "../globals.css";

/**
 * The image review tool lives outside `src/app/[locale]/`, so it has no
 * ancestor layout — Next's App Router requires the outermost layout on any
 * branch to render <html>/<body>. This is that layout for the /review
 * branch only; it does not touch or duplicate `[locale]/layout.tsx`.
 *
 * Not localized on purpose (English only, LTR) — this is an internal dev
 * tool (see page.tsx and api/review/route.ts for the NODE_ENV gate), not a
 * customer-facing page.
 */
export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className="bg-ground text-ink">{children}</body>
    </html>
  );
}
