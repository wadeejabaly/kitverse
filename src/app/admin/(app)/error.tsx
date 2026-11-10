"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { button } from "../ui";

/**
 * Any admin page or form action that fails lands here (admin redesign
 * 2026-11-10) with the reason in plain words - e.g. a Settings value that
 * didn't validate - and a way to try again, instead of a blank error page.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const message = error.message && !/^An error occurred in the Server Components render/.test(error.message) ? error.message : "Something went wrong loading this page.";
  return (
    <div className="mx-auto mt-10 max-w-lg">
      <div className="kv-card border-l-[3px] border-l-red p-6">
        <div className="mb-3 flex items-center gap-2.5 text-red"><AlertTriangle className="h-5 w-5" /><span className="font-semibold">That didn&apos;t work</span></div>
        <p className="text-sm text-ink-2">{message}</p>
        {error.digest ? <p className="mt-2 font-mono text-[11px] text-muted">Ref {error.digest}</p> : null}
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={reset} className={button.primary}><RotateCcw className="h-4 w-4" /> Try again</button>
          <button type="button" onClick={() => history.back()} className={button.ghost}>Go back</button>
        </div>
      </div>
    </div>
  );
}
