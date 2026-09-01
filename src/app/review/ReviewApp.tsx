"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Product } from "@/data/types";

type ReviewEntry = { state: "approved" | "rejected"; image?: string; at: string };
type ReviewStateMap = Record<string, ReviewEntry | undefined>;
type Candidate = { hash: string; raw: string; version: string; imageUrl: string };

/**
 * Keyboard-driven contact sheet for clearing product images before launch
 * (products only render on the storefront once `reviewState[handle].state
 * === "approved"` — see src/data/pricing.ts's sibling, src/data/catalog.ts).
 *
 * Dev-only tool — English strings are hardcoded here on purpose (see
 * page.tsx's NODE_ENV gate; this never ships to production).
 *
 * Keys: A approve · R reject · ←/→ (or ↑/↓) navigate · S swap panel · G grid.
 */
export function ReviewApp({
  initialProducts,
  initialReviewState,
}: {
  initialProducts: Product[];
  initialReviewState: ReviewStateMap;
}) {
  const [products] = useState(initialProducts);
  const [reviewState, setReviewState] = useState<ReviewStateMap>(initialReviewState);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<"sheet" | "grid">("sheet");
  const [swapOpen, setSwapOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = products[index];

  const counts = useMemo(() => {
    let approved = 0;
    let rejected = 0;
    for (const p of products) {
      const s = reviewState[p.handle]?.state;
      if (s === "approved") approved++;
      else if (s === "rejected") rejected++;
    }
    return { approved, rejected, unreviewed: products.length - approved - rejected, total: products.length };
  }, [products, reviewState]);

  const mutate = useCallback(
    async (body: { action: "approve" | "reject"; handle: string } | { action: "swap"; handle: string; hash: string }) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ? JSON.stringify(json.error) : "request failed");
        setReviewState((prev) => ({ ...prev, [body.handle]: json.entry }));
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "request failed");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const approve = useCallback(() => {
    if (current) void mutate({ action: "approve", handle: current.handle });
  }, [current, mutate]);

  const reject = useCallback(() => {
    if (current) void mutate({ action: "reject", handle: current.handle });
  }, [current, mutate]);

  const openSwap = useCallback(() => {
    if (!current) return;
    setSwapOpen(true);
    setCandidatesLoading(true);
    fetch(`/api/review?mode=candidates&handle=${encodeURIComponent(current.handle)}`)
      .then((r) => r.json())
      .then((json) => setCandidates(json.candidates ?? []))
      .catch(() => setCandidates([]))
      .finally(() => setCandidatesLoading(false));
  }, [current]);

  const chooseSwap = useCallback(
    async (hash: string) => {
      if (!current) return;
      const ok = await mutate({ action: "swap", handle: current.handle, hash });
      if (ok) setSwapOpen(false);
    },
    [current, mutate],
  );

  const goto = useCallback(
    (delta: number) => {
      setIndex((i) => Math.min(Math.max(i + delta, 0), products.length - 1));
    },
    [products.length],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "g" || e.key === "G") {
        setMode((m) => (m === "sheet" ? "grid" : "sheet"));
        return;
      }
      if (mode !== "sheet") return;

      if (swapOpen) {
        if (e.key === "Escape") setSwapOpen(false);
        return;
      }
      if (e.key === "a" || e.key === "A") approve();
      else if (e.key === "r" || e.key === "R") reject();
      else if (e.key === "s" || e.key === "S") openSwap();
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") goto(1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") goto(-1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, swapOpen, approve, reject, openSwap, goto]);

  if (products.length === 0) {
    return <p className="p-8 text-sm text-ink-soft">No products in the catalog. Run `npm run import-catalog` first.</p>;
  }

  return (
    <div className="mx-auto max-w-page px-6 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-4">
        <div>
          <h1 className="text-lg font-medium">KitVerse — image review</h1>
          <p className="mono-eyebrow mt-1 text-ink-soft">
            {counts.approved} approved · {counts.rejected} rejected · {counts.unreviewed} unreviewed · {counts.total} total
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm text-ink-soft">
          {busy && <span>saving…</span>}
          {error && <span className="text-red-600">{error}</span>}
          <span>
            <kbd className="border border-rule px-1">A</kbd> approve ·{" "}
            <kbd className="border border-rule px-1">R</kbd> reject ·{" "}
            <kbd className="border border-rule px-1">←/→</kbd> nav ·{" "}
            <kbd className="border border-rule px-1">S</kbd> swap ·{" "}
            <kbd className="border border-rule px-1">G</kbd> grid
          </span>
        </div>
      </header>

      {mode === "grid" ? (
        <GridOverview
          products={products}
          reviewState={reviewState}
          onSelect={(i) => {
            setIndex(i);
            setMode("sheet");
          }}
        />
      ) : (
        current && (
          <ContactSheet
            product={current}
            index={index}
            total={products.length}
            entry={reviewState[current.handle]}
            onApprove={approve}
            onReject={reject}
            onSwap={openSwap}
            onPrev={() => goto(-1)}
            onNext={() => goto(1)}
          />
        )
      )}

      {swapOpen && current && (
        <SwapPanel
          handle={current.handle}
          candidates={candidates}
          loading={candidatesLoading}
          onChoose={chooseSwap}
          onClose={() => setSwapOpen(false)}
        />
      )}
    </div>
  );
}

function StateBadge({ entry }: { entry?: ReviewEntry }) {
  const state = entry?.state ?? "unreviewed";
  const styles =
    state === "approved"
      ? "border-accent text-accent"
      : state === "rejected"
        ? "border-red-600 text-red-600"
        : "border-rule text-ink-soft";
  return <span className={`mono-eyebrow border px-2 py-0.5 ${styles}`}>{state}</span>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="bg-chip px-2 py-0.5 text-xs text-ink-soft">{children}</span>;
}

function ContactSheet({
  product,
  index,
  total,
  entry,
  onApprove,
  onReject,
  onSwap,
  onPrev,
  onNext,
}: {
  product: Product;
  index: number;
  total: number;
  entry?: ReviewEntry;
  onApprove: () => void;
  onReject: () => void;
  onSwap: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="grid gap-8 sm:grid-cols-[420px_1fr]">
      <div className="aspect-square w-full max-w-[420px] border border-rule bg-tile">
        {/* eslint-disable-next-line @next/next/no-img-element -- dev-only tool, no next/image optimization needed */}
        <img
          src={product.image}
          alt={product.title}
          className="h-full w-full object-contain"
        />
      </div>
      <div className="flex flex-col gap-4">
        <p className="mono-eyebrow text-ink-soft">
          {index + 1} / {total} · {product.handle}
        </p>
        <div className="flex items-center gap-2">
          <StateBadge entry={entry} />
          {entry?.image && <Badge>swapped → {entry.image}</Badge>}
        </div>
        <h2 className="text-2xl font-medium">{product.title}</h2>
        <p dir="rtl" lang="ar" className="text-lg text-ink-soft">
          {product.titleAr}
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge>{product.team}</Badge>
          <Badge>{product.season}</Badge>
          <Badge>{product.kit}</Badge>
          <Badge>{product.kind}</Badge>
          {product.league && <Badge>{product.league}</Badge>}
          {product.edition === "anniversary" && <Badge>anniversary</Badge>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onApprove}
            className="border border-accent bg-accent px-4 py-2 text-sm text-accent-ink"
          >
            Approve (A)
          </button>
          <button type="button" onClick={onReject} className="border border-rule px-4 py-2 text-sm">
            Reject (R)
          </button>
          <button type="button" onClick={onSwap} className="border border-rule px-4 py-2 text-sm">
            Swap image (S)
          </button>
          <button type="button" onClick={onPrev} className="border border-rule px-4 py-2 text-sm">
            ← Prev
          </button>
          <button type="button" onClick={onNext} className="border border-rule px-4 py-2 text-sm">
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

function GridOverview({
  products,
  reviewState,
  onSelect,
}: {
  products: Product[];
  reviewState: ReviewStateMap;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
      {products.map((p, i) => {
        const state = reviewState[p.handle]?.state ?? "unreviewed";
        const borderColor =
          state === "approved" ? "border-accent" : state === "rejected" ? "border-red-600" : "border-rule";
        return (
          <button
            key={p.handle}
            type="button"
            onClick={() => onSelect(i)}
            className={`aspect-square border-4 bg-tile text-start ${borderColor}`}
            title={`${p.title} — ${state}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- dev-only tool */}
            <img src={p.image} alt={p.title} className="h-full w-full object-contain" />
          </button>
        );
      })}
    </div>
  );
}

function SwapPanel({
  handle,
  candidates,
  loading,
  onChoose,
  onClose,
}: {
  handle: string;
  candidates: Candidate[];
  loading: boolean;
  onChoose: (hash: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
      <div className="max-h-[80vh] w-full max-w-3xl overflow-y-auto border border-rule bg-ground p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-medium">Swap image — {handle}</h3>
          <button type="button" onClick={onClose} className="border border-rule px-3 py-1 text-sm">
            Close (Esc)
          </button>
        </div>
        {loading && <p className="text-sm text-ink-soft">Loading candidates…</p>}
        {!loading && candidates.length === 0 && (
          <p className="text-sm text-ink-soft">No alternate photos found for this team/season/kit.</p>
        )}
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
          {candidates.map((c) => (
            <button
              key={c.hash}
              type="button"
              onClick={() => onChoose(c.hash)}
              className="flex flex-col gap-1 border border-rule p-2 text-start hover:border-ink"
            >
              <span className="aspect-square bg-tile">
                {/* eslint-disable-next-line @next/next/no-img-element -- dev-only tool */}
                <img src={c.imageUrl} alt={c.raw} className="h-full w-full object-contain" />
              </span>
              <span className="truncate text-xs text-ink-soft">{c.hash} · {c.version}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
