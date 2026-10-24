/* Shared admin UI primitives (server-safe). */
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** INNGEST-style wordmark: heavy uppercase name + small green label. */
export function Wordmark({ label = "Admin" }: { label?: string }) {
  return (
    <Link href="/admin" className="flex items-baseline gap-2.5">
      <span className="text-[22px] font-black uppercase leading-none tracking-[-0.04em] text-ink">Kitverse</span>
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-pitch">{label}</span>
    </Link>
  );
}

/** Page title bar across the top of the panel (bleeds to the panel edges). */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="relative mb-6 flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 before:absolute before:inset-x-[-100vw] before:bottom-0 before:h-px before:bg-line">
      <div className="min-w-0">
        <h1 className="text-lg font-medium tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="text-[13px] text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className, padded = true, accent }: { children: React.ReactNode; className?: string; padded?: boolean; accent?: "green" | "amber" | "red" }) {
  return (
    <div className={cx("rounded-xl border border-line bg-surface", accent && "border-l-[3px]", accent === "green" && "border-l-pitch", accent === "amber" && "border-l-amber",
      accent === "red" && "border-l-red", padded && "p-4 sm:p-5", className)}>{children}</div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted">{children}</h2>
      {action}
    </div>
  );
}

const tones = {
  neutral: "bg-raised text-ink-2 ring-line-2",
  green: "bg-pitch-soft text-pitch ring-pitch/20",
  amber: "bg-amber-soft text-amber ring-amber/20",
  red: "bg-red-soft text-red ring-red/20",
  ink: "bg-ink text-paper ring-ink",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", tones[tone], className)}>{children}</span>;
}

/** Label-over-value metric, like the Method / SDK version rows in a console. */
export function Stat({ label, value, icon: Icon, hint, accent }: { label: string; value: React.ReactNode; icon: LucideIcon; hint?: string; accent?: boolean }) {
  return (
    <Card accent={accent ? "green" : undefined} className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-muted">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
        <span className="text-[13px]">{label}</span>
      </div>
      <div className="text-[26px] font-medium leading-none tracking-tight text-ink tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-muted">{hint}</div> : null}
    </Card>
  );
}

const btnBase = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors active:scale-[.98] disabled:opacity-50";
export const button = {
  primary: `${btnBase} bg-pitch-fill text-white hover:bg-pitch-fill-2`,
  dark: `${btnBase} bg-ink text-paper hover:bg-ink-2`,
  ghost: `${btnBase} border border-line-2 bg-surface text-ink hover:bg-raised`,
  danger: `${btnBase} border border-red/30 bg-surface text-red hover:bg-red-soft`,
  subtle: `${btnBase} px-2.5 text-muted hover:bg-raised hover:text-ink`,
};

export const input = "w-full rounded-lg border border-line-2 bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted/70 outline-none focus:border-pitch focus:ring-2 focus:ring-pitch/15";

export function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-2 px-6 py-12 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-raised text-pitch"><Icon className="h-5 w-5" strokeWidth={1.75} /></div>
      <div className="font-medium text-ink">{title}</div>
      {text ? <p className="max-w-sm text-sm text-muted">{text}</p> : null}
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  return <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line-2 bg-raised text-[13px] font-medium text-ink-2">{initials}</div>;
}

export function Row({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return <Link href={href} className={cx("flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-raised sm:px-5", className)}>{children}</Link>;
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
  confirmed: { label: "New", tone: "green" }, paid: { label: "Paid", tone: "green" }, in_supplier_batch: { label: "At supplier", tone: "amber" },
  produced: { label: "Produced", tone: "amber" }, at_warehouse: { label: "At warehouse", tone: "amber" }, with_courier: { label: "With courier", tone: "amber" },
  delivered: { label: "Delivered", tone: "neutral" }, cancelled: { label: "Cancelled", tone: "red" }, issue: { label: "Issue", tone: "red" },
};
