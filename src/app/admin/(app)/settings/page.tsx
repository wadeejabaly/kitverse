import { Bot, Cpu, Gauge, Wallet, FlaskConical } from "lucide-react";
import { db } from "@/lib/db";
import { saveSetting } from "../../actions";
import { PageHeader, Card, Badge, button, input, cx } from "../../ui";

export const dynamic = "force-dynamic";

const isFuture = (iso: unknown) => !!iso && new Date(String(iso)).getTime() > Date.now();

function Section({ icon: Icon, title, text, children }: { icon: typeof Bot; title: string; text: string; children: React.ReactNode }) {
  return (
    <Card className="grid gap-4 md:grid-cols-[220px_1fr]">
      <div>
        <div className="flex items-center gap-2 font-medium"><Icon className="h-4 w-4 text-pitch" strokeWidth={1.75} />{title}</div>
        <p className="mt-1 text-sm text-muted">{text}</p>
      </div>
      <div>{children}</div>
    </Card>
  );
}

function Choice({ name, value, checked, title, text }: { name: string; value: string; checked: boolean; title: string; text: string }) {
  return (
    <label className={cx("flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors", checked ? "border-pitch bg-pitch-soft/50" : "border-line hover:border-line-2")}>
      <input type="radio" name={name} value={value} defaultChecked={checked} className="mt-1 accent-[var(--pitch)]" />
      <span><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-muted">{text}</span></span>
    </label>
  );
}

const num = (name: string, value: unknown) => <input name={name} defaultValue={String(value ?? "")} inputMode="numeric" className={`${input} w-24 text-center tabular-nums`} />;

export default async function Settings() {
  const rows = (await db().from("bot_settings").select("key,value")).data ?? [];
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, Record<string, unknown>>;
  const autonomy = (s.autonomy?.mode as string) ?? "draft";
  const spend = s.spend ?? {};
  const overrideOn = isFuture(spend.override_until);
  const rl = s.rate_limits ?? {};
  const spent = Number((await db().rpc("spend_today_usd")).data ?? 0);
  const testers = { enabled: (s.testers?.enabled as boolean | undefined) ?? true, usernames: (s.testers?.usernames as string[] | undefined) ?? [], code: (s.testers?.code as string | undefined) || "kvtest", joined: ((s.testers?.allowed_ids as string[] | undefined) ?? []).length };

  return (
    <>
      <PageHeader title="Settings" subtitle="How the bot behaves. Changes apply right away." />
      <div className="flex flex-col gap-4">
        <Section icon={FlaskConical} title="Who the bot talks to" text="While testing, the bot only answers the Instagram accounts listed here. Everyone else is ignored by the bot and you answer them in Instagram as usual.">
          <form action={saveSetting} className="flex flex-col gap-2">
            <input type="hidden" name="key" value="testers" />
            <Choice name="mode" value="testers" checked={testers.enabled} title="Test accounts only" text="Customers never see the bot. Safe while it's being tested." />
            <Choice name="mode" value="everyone" checked={!testers.enabled} title="Everyone" text="Go live: the bot handles every chat." />
            <label className="mt-2 flex flex-col gap-1 text-xs text-muted">
              Test accounts (Instagram usernames, one per line)
              <textarea name="usernames" rows={3} defaultValue={testers.usernames.map((u) => `@${u}`).join("\n")} placeholder={"@your_username\n@friend_username"} className={`${input} font-mono text-sm`} />
            </label>
            <label className="mt-2 flex flex-col gap-1 text-xs text-muted">
              Join word: a tester DMs this once and is connected (Instagram hides usernames of new chats)
              <input name="code" defaultValue={testers.code} className={`${input} w-40 font-mono text-sm`} />
            </label>
            <p className="text-xs text-muted">{testers.joined} account{testers.joined === 1 ? "" : "s"} connected so far.</p>
            {testers.enabled && !testers.usernames.length ? <p className="text-xs text-amber">No test accounts yet, so the bot answers nobody.</p> : null}
            <button className={`${button.primary} mt-1 self-start`}>Save</button>
          </form>
        </Section>

        <Section icon={Bot} title="Who sends replies" text="Start in approval mode; switch to automatic once you trust it.">
          <form action={saveSetting} className="flex flex-col gap-2">
            <input type="hidden" name="key" value="autonomy" />
            <Choice name="mode" value="draft" checked={autonomy !== "auto"} title="I approve every reply" text="The bot writes, you tap Send. Recommended for launch." />
            <Choice name="mode" value="auto" checked={autonomy === "auto"} title="Bot replies by itself" text="Discounts, missing shirts, complaints and similar still come to you." />
            <button className={`${button.primary} mt-1 self-start`}>Save</button>
          </form>
        </Section>

        <Section icon={Cpu} title="AI spending" text="The bot stops for the day at the cap. The Anthropic account's monthly cap always stays on as the last safeguard.">
          <div className="mb-4 flex items-center gap-3">
            <div className="text-2xl font-semibold tabular-nums">${spent.toFixed(2)}</div>
            <span className="text-sm text-muted">spent today</span>
            {overrideOn ? <Badge tone="amber">Cap override on</Badge> : null}
          </div>
          <form action={saveSetting} className="flex flex-wrap items-end gap-3 text-sm">
            <input type="hidden" name="key" value="spend_limits" />
            <label className="flex flex-col gap-1 text-xs text-muted">Alert at ($){num("daily_alert_usd", spend.daily_alert_usd ?? 10)}</label>
            <label className="flex flex-col gap-1 text-xs text-muted">Stop at ($){num("daily_stop_usd", spend.daily_stop_usd ?? 25)}</label>
            <button className={button.ghost}>Save</button>
          </form>
          <form action={saveSetting} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="key" value="spend_override" />
            {overrideOn ? <button name="value" value="off" className={button.ghost}>Restore the daily cap</button> : (
              <><button name="value" value="today" className={button.ghost}>Ignore the cap today</button><button name="value" value="forever" className={button.ghost}>Ignore the cap always</button></>
            )}
          </form>
        </Section>

        <Section icon={Gauge} title="Reply limits" text="Protects against spam and endless chats. Bot replies per customer; when reached, the chat comes to you.">
          <form action={saveSetting} className="flex flex-col gap-3 text-sm">
            <input type="hidden" name="key" value="rate_limits" />
            {[
              ["new_per_24h", "New customer, per day"], ["new_lifetime_before_review", "New customer, total before you review"],
              ["engaged_per_24h", "Has a quote, per day"], ["buyer_per_24h", "Bought before, per day"], ["spam_msgs_per_min", "Spam: customer messages per minute"],
            ].map(([k, label]) => (
              <div key={k} className="flex items-center justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0"><span className="text-ink-2">{label}</span>{num(k, rl[k])}</div>
            ))}
            <button className={`${button.primary} self-start`}>Save</button>
          </form>
        </Section>

        <Section icon={Wallet} title="Deposit" text="Ask for a small Bit deposit before confirming cash-on-delivery orders.">
          <form action={saveSetting} className="flex items-center justify-between gap-3 text-sm">
            <input type="hidden" name="key" value="deposit" />
            <label className="flex items-center gap-2.5"><input type="checkbox" name="enabled" defaultChecked={!!s.deposit?.enabled} className="h-4 w-4 accent-[var(--pitch)]" />Require a 35-50₪ Bit deposit</label>
            <button className={button.ghost}>Save</button>
          </form>
        </Section>
      </div>
    </>
  );
}
