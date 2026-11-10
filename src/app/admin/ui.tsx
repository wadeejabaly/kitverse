/* Shared admin UI primitives (server-safe). */
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** The Kitverse wordmark: the crest badge + display name, with a small gold "Admin" label. */
export function Wordmark({ label = "Admin", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <Link href="/admin" className="flex items-center gap-2.5" aria-label="Kitverse admin home">
      {/* eslint-disable-next-line @next/next/no-img-element -- the storefront's own small crest asset */}
      <img src="/icon-192.png" alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-full ring-1 ring-line-2" />
      {compact ? null : (
        <span className="flex flex-col leading-none">
          <span className="kv-display text-[19px] font-bold uppercase tracking-[0.02em] text-ink">Kitverse</span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">{label}</span>
        </span>
      )}
    </Link>
  );
}

/** Page title bar: gold eyebrow, display-face title, subtitle and actions on the right. */
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-line pb-5 pt-1">
      <div className="min-w-0">
        {eyebrow ? <div className="kv-eyebrow mb-1.5">{eyebrow}</div> : null}
        <h1 className="kv-display text-[26px] font-bold leading-tight text-ink sm:text-[30px]">{title}</h1>
        {subtitle ? <div className="mt-1 max-w-3xl text-[13.5px] text-muted">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className, padded = true, accent }: { children: React.ReactNode; className?: string; padded?: boolean; accent?: "green" | "amber" | "red" | "blue" | "gold" }) {
  return (
    <div className={cx("kv-card", accent && "border-l-[3px]", accent === "green" && "border-l-green", accent === "amber" && "border-l-amber",
      accent === "red" && "border-l-red", accent === "blue" && "border-l-pitch-fill", accent === "gold" && "border-l-gold", padded && "p-4 sm:p-5", className)}>{children}</div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">{children}</h2>
      {action}
    </div>
  );
}

const tones = {
  neutral: "bg-raised text-ink-2 ring-line-2",
  green: "bg-green-soft text-green ring-green/25",
  blue: "bg-pitch-soft text-pitch ring-pitch/25",
  amber: "bg-amber-soft text-amber ring-amber/25",
  red: "bg-red-soft text-red ring-red/25",
  gold: "bg-gold-soft text-gold ring-gold/25",
  ink: "bg-ink text-paper ring-ink",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", tones[tone], className)}>{children}</span>;
}

/** A status dot + label (lighter than a Badge, for tables). */
export function StatusDot({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  const dot = { neutral: "bg-muted", green: "bg-green", blue: "bg-pitch", amber: "bg-amber", red: "bg-red", gold: "bg-gold", ink: "bg-ink" }[tone];
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-ink-2"><span className={cx("h-1.5 w-1.5 rounded-full", dot)} />{children}</span>;
}

/** Label-over-value metric. */
export function Stat({ label, value, icon: Icon, hint, accent }: { label: string; value: React.ReactNode; icon: LucideIcon; hint?: string; accent?: boolean }) {
  return <Kpi label={label} value={value} icon={Icon} hint={hint} tone={accent ? "blue" : undefined} />;
}

/**
 * The dashboard KPI card: icon chip, label, big display-face value, a hint
 * line and an optional mini trend (any 2+ numbers, drawn as a sparkline).
 */
export function Kpi({ label, value, icon: Icon, hint, tone, trend, href }: {
  label: string; value: React.ReactNode; icon: LucideIcon; hint?: React.ReactNode; tone?: "blue" | "gold" | "green" | "amber" | "red"; trend?: number[]; href?: string;
}) {
  const chip = { blue: "bg-pitch-soft text-pitch", gold: "bg-gold-soft text-gold", green: "bg-green-soft text-green", amber: "bg-amber-soft text-amber", red: "bg-red-soft text-red" }[tone ?? "blue"];
  const body = (
    <div className={cx("kv-card relative flex h-full flex-col gap-3 overflow-hidden p-4 sm:p-5", href && "transition-colors hover:border-line-2")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-muted">{label}</span>
        <span className={cx("grid h-8 w-8 place-items-center rounded-lg", chip)}><Icon className="h-4 w-4" strokeWidth={1.8} /></span>
      </div>
      <div className="kv-display text-[28px] font-bold leading-none tracking-tight text-ink tabular-nums">{value}</div>
      <div className="flex min-h-5 items-end justify-between gap-2">
        {hint ? <div className="text-xs text-muted">{hint}</div> : <span />}
        {trend && trend.length > 1 ? <Sparkline values={trend} /> : null}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

/** A tiny inline trend line (server-rendered SVG, no client JS). */
export function Sparkline({ values, width = 84, height = 26 }: { values: number[]; width?: number; height?: number }) {
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 2 - ((v - min) / span) * (height - 4)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="shrink-0 overflow-visible">
      <path d={`${d} L${width},${height} L0,${height} Z`} fill="rgb(47 107 255 / 0.14)" />
      <path d={d} fill="none" stroke="var(--pitch)" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const btnBase = "inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch/60";
export const button = {
  primary: `${btnBase} bg-pitch-fill text-white shadow-[0_8px_20px_-10px_rgb(47_107_255/0.9)] hover:bg-pitch-fill-2`,
  dark: `${btnBase} border border-line-2 bg-raised text-ink hover:border-pitch/40 hover:bg-raised/70`,
  gold: `${btnBase} bg-gold text-[#1a1406] hover:brightness-110`,
  ghost: `${btnBase} border border-line-2 bg-raised/40 text-ink hover:border-pitch/40 hover:bg-raised`,
  danger: `${btnBase} border border-red/35 bg-red-soft/40 text-red hover:bg-red-soft`,
  subtle: `${btnBase} px-2.5 text-muted hover:bg-raised hover:text-ink`,
};

export const input = "w-full rounded-xl border border-line-2 bg-raised/60 px-3 py-2 text-sm text-ink placeholder:text-muted/70 outline-none transition-colors focus:border-pitch focus:bg-raised focus:ring-2 focus:ring-pitch/20";

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-2 bg-surface/40 px-6 py-12 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-pitch-soft text-pitch"><Icon className="h-5 w-5" strokeWidth={1.75} /></div>
      <div className="font-semibold text-ink">{title}</div>
      {text ? <p className="max-w-sm text-sm text-muted">{text}</p> : null}
      {action}
    </div>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  return (
    <div style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-pitch-fill/40 to-gold/25 text-[13px] font-semibold text-ink ring-1 ring-line-2">
      {initials}
    </div>
  );
}

export function Row({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return <Link href={href} className={cx("flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-raised/60 sm:px-5", className)}>{children}</Link>;
}

/** Segmented tabs (links), e.g. order status filters. */
export function Tabs({ items, active }: { items: { href: string; label: React.ReactNode; key: string; count?: number }[]; active: string }) {
  return (
    <div className="mb-4 flex max-w-full overflow-x-auto">
      <div className="inline-flex shrink-0 gap-1 rounded-xl border border-line bg-surface/70 p-1 text-sm">
        {items.map((t) => (
          <Link key={t.key} href={t.href}
            className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition-colors",
              t.key === active ? "bg-pitch-fill text-white shadow-[0_6px_16px_-10px_rgb(47_107_255/0.9)]" : "text-muted hover:bg-raised hover:text-ink")}>
            {t.label}
            {t.count ? <span className={cx("rounded-full px-1.5 text-[11px] tabular-nums", t.key === active ? "bg-white/20" : "bg-raised text-ink-2")}>{t.count}</span> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** ₪ amount from agorot, e.g. 30000 -> "₪300", 29990 -> "₪299.90". */
export const ils = (agorot: number) => `₪${(agorot / 100).toLocaleString("en-US", { minimumFractionDigits: agorot % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** A labelled key/value line (order details, customer profile). */
export function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 text-end text-ink">{children}</span>
    </div>
  );
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** How an order is paid, as the owner reads it (Bit was shown as "Cash" - a courier could collect twice). */
export const payLabel = (method: string | null | undefined, paymentStatus?: string | null, long = false) => {
  const base = method === "paypal" ? "PayPal" : method === "bit" ? "Bit" : method === "bit_personal" ? (long ? "Bit (personal transfer)" : "Bit transfer") : method === "paypal_me" ? "PayPal.Me" : long ? "Cash on delivery" : "Cash";
  return method && method !== "cod" ? `${base}${paymentStatus === "paid" ? " · paid" : paymentStatus === "refunded" ? " · refunded" : " · not paid yet"}` : base;
};

export const ilTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Jerusalem", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const KIND: Record<string, { label: string; tone: Tone }> = {
  draft_reply: { label: "Reply to approve", tone: "green" },
  discount: { label: "Discount", tone: "amber" },
  availability_check: { label: "Availability", tone: "amber" },
  compensation: { label: "Compensation", tone: "red" },
  custom_print: { label: "Custom print", tone: "neutral" },
  change_after_batch: { label: "Change after batch", tone: "amber" },
  cancellation: { label: "Cancellation", tone: "red" },
  complaint: { label: "Complaint", tone: "red" },
  return: { label: "Return", tone: "red" },
  payment_exception: { label: "Payment", tone: "amber" },
  large_order: { label: "Large order", tone: "green" },
  low_confidence: { label: "Bot unsure", tone: "neutral" },
  rate_limit: { label: "Limit reached", tone: "neutral" },
  other: { label: "Decision", tone: "neutral" },
};

export const MODE: Record<string, { label: string; tone: Tone }> = {
  bot: { label: "Bot replies", tone: "green" },
  draft: { label: "Bot drafts", tone: "amber" },
  owner: { label: "You reply", tone: "ink" },
  paused: { label: "Paused", tone: "neutral" },
  blocked: { label: "Blocked", tone: "red" },
};

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" }, quoted: { label: "Quoted", tone: "neutral" },
  awaiting_details: { label: "Awaiting details", tone: "neutral" }, awaiting_confirmation: { label: "Awaiting confirm", tone: "neutral" },
  awaiting_payment_verification: { label: "Verify payment", tone: "amber" },
  confirmed: { label: "New", tone: "blue" }, paid: { label: "Paid", tone: "blue" }, in_supplier_batch: { label: "At supplier", tone: "gold" },
  produced: { label: "Produced", tone: "gold" }, at_warehouse: { label: "At warehouse", tone: "amber" }, with_courier: { label: "With courier", tone: "amber" },
  delivered: { label: "Delivered", tone: "green" }, cancelled: { label: "Cancelled", tone: "red" }, issue: { label: "Issue", tone: "red" },
};
