/*
 * Admin charts (admin redesign 2026-11-10): small, dependency-free SVG charts
 * rendered on the server. Every chart is fed real numbers by its page; hover
 * shows exact values through native <title> tooltips, so no client JS.
 * Colours follow the storefront: electric blue for the main series, gold for
 * the second, a few quiet tones for categories.
 */
import { cx } from "./ui";

export const SERIES = ["#2f6bff", "#d4b26a", "#4ade9b", "#f5b14c", "#ff7a70", "#a78bfa", "#8a94b5", "#5eead4"];

type Point = { label: string; value: number };

/** Nice rounded maximum for an axis (1, 2, 2.5, 5 × 10^n). */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

/** Every `every`-th axis label, plus the last one when it isn't crowded by the previous label. */
const showLabel = (i: number, n: number, every: number) => i % every === 0 || (i === n - 1 && (n - 1) % every >= every / 2);

/** Area/line chart over time (e.g. revenue per day). */
export function AreaChart({ data, height = 200, format = (v: number) => v.toLocaleString(), labelEvery }: {
  data: Point[]; height?: number; format?: (v: number) => string; labelEvery?: number;
}) {
  const W = 640, H = height, padL = 44, padR = 8, padT = 10, padB = 24;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const iw = W - padL - padR, ih = H - padT - padB;
  const x = (i: number) => padL + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => padT + ih - (v / max) * ih;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / 8));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const id = `g${data.length}${Math.round(max)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Chart">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#2f6bff" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#2f6bff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t ? "3 4" : undefined} />
          <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)">{format(t)}</text>
        </g>
      ))}
      {data.length > 1 ? <path d={`${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${id})`} /> : null}
      <path d={line} fill="none" stroke="#4a7dff" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.value)} r={d.value ? 2.6 : 0} fill="#93b0ff" />
          {/* wide invisible hit area for the tooltip */}
          <rect x={x(i) - iw / data.length / 2} y={padT} width={iw / data.length} height={ih} fill="transparent">
            <title>{`${d.label}: ${format(d.value)}`}</title>
          </rect>
          {showLabel(i, data.length, every) ? (
            <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{d.label}</text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

/** Vertical bars (e.g. orders per day). */
export function BarChart({ data, height = 180, color = "#2f6bff", format = (v: number) => v.toLocaleString(), labelEvery }: {
  data: Point[]; height?: number; color?: string; format?: (v: number) => string; labelEvery?: number;
}) {
  const W = 640, H = height, padL = 34, padR = 6, padT = 10, padB = 24;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const iw = W - padL - padR, ih = H - padT - padB;
  const slot = iw / Math.max(1, data.length);
  const bw = Math.max(3, Math.min(28, slot * 0.62));
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / 8));
  const y = (v: number) => padT + ih - (v / max) * ih;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Chart">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={padL} x2={W - padR} y1={y(f * max)} y2={y(f * max)} stroke="var(--line)" strokeDasharray={f ? "3 4" : undefined} />
          <text x={padL - 6} y={y(f * max) + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)">{format(f * max)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx0 = padL + slot * i + slot / 2;
        const h = Math.max(d.value ? 2 : 0, (d.value / max) * ih);
        return (
          <g key={i}>
            <rect x={cx0 - bw / 2} y={padT + ih - h} width={bw} height={h} rx={Math.min(4, bw / 2)} fill={color} opacity={0.92}>
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </rect>
            {showLabel(i, data.length, every) ? (
              <text x={cx0} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{d.label}</text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** Donut with a legend (e.g. order status distribution). */
export function Donut({ data, size = 168, center, format = (v: number) => v.toLocaleString() }: {
  data: (Point & { color?: string })[]; size?: number; center?: { value: string; label: string }; format?: (v: number) => string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - 12, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label="Distribution">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--raised)" strokeWidth={16} />
        {total > 0
          ? data.map((d, i) => {
              const len = (d.value / total) * c;
              const el = (
                <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color ?? SERIES[i % SERIES.length]} strokeWidth={16}
                  strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
                  <title>{`${d.label}: ${format(d.value)} (${Math.round((d.value / total) * 100)}%)`}</title>
                </circle>
              );
              offset += len;
              return el;
            })
          : null}
        {center ? (
          <>
            <text x="50%" y="48%" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--ink)">{center.value}</text>
            <text x="50%" y="60%" textAnchor="middle" fontSize="10.5" fill="var(--muted)">{center.label}</text>
          </>
        ) : null}
      </svg>
      <ul className="flex min-w-[150px] flex-1 flex-col gap-2 text-[13px]">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color ?? SERIES[i % SERIES.length] }} />
            <span className="min-w-0 flex-1 truncate text-ink-2">{d.label}</span>
            <span className="tabular-nums text-ink">{format(d.value)}</span>
            <span className="w-9 text-end text-[11px] tabular-nums text-muted">{total ? `${Math.round((d.value / total) * 100)}%` : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ranked horizontal bars (e.g. best sellers, top pages). */
export function RankList({ rows, format = (v: number) => v.toLocaleString(), color = "#2f6bff", empty }: {
  rows: { label: React.ReactNode; value: number; sub?: React.ReactNode; key?: string }[]; format?: (v: number) => string; color?: string; empty?: React.ReactNode;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <>{empty ?? null}</>;
  return (
    <ol className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <li key={r.key ?? i} className="grid grid-cols-[20px_1fr_auto] items-center gap-x-3 gap-y-1.5">
          <span className="text-[11px] font-semibold tabular-nums text-muted">{i + 1}</span>
          <span className="min-w-0 truncate text-[13.5px] text-ink">{r.label}{r.sub ? <span className="ms-2 text-xs text-muted">{r.sub}</span> : null}</span>
          <span className="text-[13px] font-semibold tabular-nums text-ink">{format(r.value)}</span>
          <span />
          <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-raised">
            <span className={cx("block h-full rounded-full")} style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, background: color }} />
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Chart panel: title, optional figure on the right, body. */
export function ChartCard({ title, figure, sub, children, className }: { title: string; figure?: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("kv-card p-4 sm:p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">{title}</h2>
          {sub ? <div className="mt-1 text-xs text-muted">{sub}</div> : null}
        </div>
        {figure ? <div className="kv-display text-2xl font-bold tabular-nums text-ink">{figure}</div> : null}
      </div>
      {children}
    </section>
  );
}
