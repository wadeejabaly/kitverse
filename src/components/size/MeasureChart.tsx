"use client";

import { useState } from "react";

/**
 * One measurement chart on the size guide (redesign, owner request 2026-11-15: "all the measurements").
 * A garment drawing with lettered measuring lines, size chips, a legend that shows the picked size's
 * numbers, and the full table (rows are sizes; tapping one picks it too). The data and the translated
 * labels come from the page (src/data/size-charts.ts + KIDS_SIZE_CHART); this only lays them out.
 */
export type Measure = "chest" | "length" | "sleeve" | "shoulder" | "cuff" | "waist" | "shortsLength";
/** `fit` = a "who it fits" column (height, weight, age), shown after the measurements and muted. */
export type ChartColumn = { key: string; label: string; measure?: Measure; mark?: string; fit?: boolean };
export type ChartRow = { size: string; sub?: string; cells: Record<string, string | null> };

const COLORS: Record<Measure, string> = {
  chest: "#1f5cff",
  length: "#c9a55c",
  sleeve: "#14a37f",
  shoulder: "#8b5cf6",
  cuff: "#e5484d",
  waist: "#0891b2",
  shortsLength: "#e5484d",
};

export function MeasureChart({
  columns,
  rows,
  figure,
  defaultSize,
  labels,
}: {
  columns: ChartColumn[];
  rows: ChartRow[];
  figure: "shirt" | "shorts" | "kit";
  defaultSize: string;
  labels: { size: string; pick: string; na: string; tapHint: string };
}) {
  const [picked, setPicked] = useState(defaultSize);
  const row = rows.find((r) => r.size === picked) ?? rows[0];
  const measured = columns.filter((c) => !c.fit);
  const fits = columns.filter((c) => c.fit);
  const marks = Object.fromEntries(measured.filter((c) => c.measure).map((c) => [c.measure!, c.mark ?? ""])) as Partial<Record<Measure, string>>;
  const color = (c: ChartColumn) => (c.measure ? COLORS[c.measure] : "#8a93a8");
  const missing = measured.every((c) => row.cells[c.key] == null);

  return (
    <div className="kv-measure grid gap-0 wide:grid-cols-[minmax(240px,290px)_1fr]">
      {/* figure + picked size */}
      <div className="kv-measure-side flex flex-col gap-4 p-5 sm:p-6">
        <div role="group" aria-label={labels.pick} className="flex flex-wrap gap-1.5">
          {rows.map((r) => (
            <button
              key={r.size}
              type="button"
              aria-pressed={r.size === row.size}
              onClick={() => setPicked(r.size)}
              className="kv-measure-chip latin tabular"
            >
              {r.size}
            </button>
          ))}
        </div>
        {/* phone/tablet: drawing and numbers side by side; desktop side column: stacked */}
        <div className="grid grid-cols-2 items-center gap-4 wide:grid-cols-1">
        <Figure kind={figure} marks={marks} />
        <dl className="grid content-center gap-1.5 text-[13.5px]">
          {measured.map((c) => (
            <div key={c.key} className="flex items-center gap-2.5">
              <Badge mark={c.mark} color={color(c)} />
              <dt className="min-w-0 grow text-ink-soft">{c.label}</dt>
              <dd className="latin tabular whitespace-nowrap font-extrabold text-ink" dir="ltr">
                {row.cells[c.key] ?? "—"}
              </dd>
            </div>
          ))}
          {missing ? <p className="mt-1 text-[12.5px] text-ink-soft">{labels.na}</p> : null}
        </dl>
        </div>
      </div>

      {/* the full table */}
      <div className="min-w-0 border-t border-rule wide:border-t-0 wide:border-s">
        <div className="overflow-x-auto">
          <table className="kv-table kv-measure-table">
            <thead>
              <tr>
                <th scope="col">{labels.size}</th>
                {measured.map((c) => (
                  <th key={c.key} scope="col">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      {c.measure ? <Badge mark={c.mark} color={color(c)} small /> : null}
                      {c.label}
                    </span>
                  </th>
                ))}
                {fits.map((c, i) => (
                  <th key={c.key} scope="col" className={`kv-measure-fit ${i === 0 ? "kv-measure-fit-first" : ""}`}>
                    <span className="whitespace-nowrap">{c.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.size} aria-selected={r.size === row.size} onClick={() => setPicked(r.size)}>
                  <td>
                    <button type="button" className="kv-measure-size" aria-pressed={r.size === row.size} onClick={() => setPicked(r.size)}>
                      <span className="latin tabular">{r.size}</span>
                      {r.sub ? <span className="latin text-[11.5px] font-semibold text-ink-soft">{r.sub}</span> : null}
                    </button>
                  </td>
                  {measured.map((c) => (
                    <td key={c.key} className="latin tabular whitespace-nowrap" dir="ltr">
                      {r.cells[c.key] ?? <span className="text-ink-soft">—</span>}
                    </td>
                  ))}
                  {fits.map((c, i) => (
                    <td key={c.key} className={`kv-measure-fit latin tabular whitespace-nowrap ${i === 0 ? "kv-measure-fit-first" : ""}`} dir="ltr">
                      {r.cells[c.key] ?? <span className="text-ink-soft">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-[12px] text-ink-soft sm:px-6">{labels.tapHint}</p>
      </div>
    </div>
  );
}

function Badge({ mark, color, small = false }: { mark?: string; color: string; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={`latin grid shrink-0 place-items-center rounded-full font-extrabold text-white ${small ? "size-[18px] text-[10px]" : "size-6 text-[11.5px]"}`}
      style={{ background: color }}
    >
      {mark}
    </span>
  );
}

/* ---- drawings ---------------------------------------------------------------------------------------- */

function Figure({ kind, marks }: { kind: "shirt" | "shorts" | "kit"; marks: Partial<Record<Measure, string>> }) {
  if (kind === "kit") {
    return (
      <svg viewBox="0 0 330 210" className="kv-measure-figure" aria-hidden>
        <g transform="translate(0 6) scale(0.86)">
          <ShirtArt marks={marks} />
        </g>
        <g transform="translate(168 50) scale(0.68)">
          <ShortsArt marks={marks} />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox={kind === "shirt" ? "0 0 230 232" : "0 0 230 200"} className="kv-measure-figure" aria-hidden>
      {kind === "shirt" ? <ShirtArt marks={marks} /> : <ShortsArt marks={marks} />}
    </svg>
  );
}

function Arrow({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  // a measuring line with a tick at each end
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * 5;
  const ny = (dx / len) * 5;
  return (
    <g stroke={color} strokeWidth={2.2} strokeLinecap="round">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <line x1={x1 - nx} y1={y1 - ny} x2={x1 + nx} y2={y1 + ny} />
      <line x1={x2 - nx} y1={y2 - ny} x2={x2 + nx} y2={y2 + ny} />
    </g>
  );
}

function Tag({ x, y, mark, color }: { x: number; y: number; mark?: string; color: string }) {
  if (!mark) return null;
  return (
    <g>
      <circle cx={x} cy={y} r={9.5} fill={color} stroke="var(--tile)" strokeWidth={2} />
      <text x={x} y={y + 3.8} textAnchor="middle" fontSize={11} fontWeight={800} fill="#fff" fontFamily="inherit">
        {mark}
      </text>
    </g>
  );
}

function ShirtArt({ marks }: { marks: Partial<Record<Measure, string>> }) {
  return (
    <g>
      <path
        d="M90 22 L62 32 L18 76 L42 102 L66 84 L66 218 L164 218 L164 84 L188 102 L212 76 L168 32 L140 22 Q115 40 90 22 Z"
        fill="var(--chip)"
        stroke="var(--ink)"
        strokeOpacity={0.55}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <path d="M90 22 Q115 40 140 22" fill="none" stroke="var(--ink)" strokeOpacity={0.55} strokeWidth={3} />
      {marks.shoulder ? (
        <>
          <Arrow x1={62} y1={14} x2={168} y2={14} color={COLORS.shoulder} />
          <Tag x={46} y={14} mark={marks.shoulder} color={COLORS.shoulder} />
        </>
      ) : null}
      {marks.chest ? (
        <>
          <Arrow x1={68} y1={98} x2={162} y2={98} color={COLORS.chest} />
          <Tag x={96} y={114} mark={marks.chest} color={COLORS.chest} />
        </>
      ) : null}
      {marks.length ? (
        <>
          <Arrow x1={140} y1={28} x2={140} y2={216} color={COLORS.length} />
          <Tag x={140} y={160} mark={marks.length} color={COLORS.length} />
        </>
      ) : null}
      {marks.sleeve ? (
        <>
          <Arrow x1={173} y1={27} x2={217} y2={71} color={COLORS.sleeve} />
          <Tag x={205} y={36} mark={marks.sleeve} color={COLORS.sleeve} />
        </>
      ) : null}
      {marks.cuff ? (
        <>
          <Arrow x1={217} y1={81} x2={193} y2={107} color={COLORS.cuff} />
          <Tag x={214} y={104} mark={marks.cuff} color={COLORS.cuff} />
        </>
      ) : null}
    </g>
  );
}

function ShortsArt({ marks }: { marks: Partial<Record<Measure, string>> }) {
  return (
    <g>
      <path
        d="M52 34 H178 L194 178 H124 L115 104 L106 178 H36 Z"
        fill="var(--chip)"
        stroke="var(--ink)"
        strokeOpacity={0.55}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <path d="M52 48 H178" stroke="var(--ink)" strokeOpacity={0.35} strokeWidth={1.4} />
      {marks.waist ? (
        <>
          <Arrow x1={52} y1={20} x2={178} y2={20} color={COLORS.waist} />
          <Tag x={115} y={20} mark={marks.waist} color={COLORS.waist} />
        </>
      ) : null}
      {marks.shortsLength ? (
        <>
          <Arrow x1={208} y1={34} x2={208} y2={178} color={COLORS.shortsLength} />
          <Tag x={208} y={106} mark={marks.shortsLength} color={COLORS.shortsLength} />
        </>
      ) : null}
    </g>
  );
}
