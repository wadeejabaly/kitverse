"use client";

import { useState } from "react";
import { DatabaseZap } from "lucide-react";
import { migrateRealPhotos } from "../../migrate-photos-actions";
import { button, cx } from "../../ui";

/**
 * One-time maintenance action (owner report 2026-11-02: "there are photos in the website that dont
 * appear in the admin") - brings the committed "real" gallery photos into the database so every shirt
 * shows up complete in "All photos" instead of just its one main picture. Safe to click more than
 * once: already-migrated shirts are skipped, so there's no harm leaving this here afterwards.
 */
export function MigrateRealPhotosButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof migrateRealPhotos>> | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      setResult(await migrateRealPhotos());
    } catch {
      setResult({ migrated: 0, uploaded: 0, skipped: 0, errors: ["The migration failed to run - try again."] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line-2 bg-surface p-3">
      <button type="button" disabled={busy} onClick={run} className={cx(button.dark, "px-3 py-2 text-sm")}>
        <DatabaseZap className="h-4 w-4" /> {busy ? "Migrating..." : "Bring gallery photos into the database"}
      </button>
      {result ? (
        <p className="text-xs text-muted">
          {result.migrated} shirts migrated, {result.uploaded} photos uploaded, {result.skipped} already done
          {result.errors.length ? `, ${result.errors.length} failed (${result.errors[0]})` : ""}.
        </p>
      ) : (
        <p className="text-xs text-muted">One-time: pulls every committed gallery photo into the database so it shows up here too. Safe to run more than once.</p>
      )}
    </div>
  );
}
