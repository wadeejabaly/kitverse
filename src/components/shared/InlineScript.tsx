/**
 * A script that runs while the browser parses the server HTML, before the
 * first paint (Next's "preventing flash before hydration" guide). On the
 * client it renders as text/plain, so React neither re-runs it on a soft
 * navigation nor warns about rendering a <script>.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
