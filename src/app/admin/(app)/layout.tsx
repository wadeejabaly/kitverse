import Link from "next/link";
import { cookies } from "next/headers";
import { LogOut } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { setBotOn, signOut } from "../actions";
import { Avatar, Wordmark, cx } from "../ui";
import { Sidebar, MobileNav, TabBar, BellLink } from "./nav";
import PushButton from "./push-button";

export const dynamic = "force-dynamic";

/**
 * Console layout (admin redesign 2026-11-10): a collapsible navy sidebar
 * (desktop) / menu drawer + quick bar (phone), a top bar with the bot switch,
 * phone alerts and notifications, and the page on the night-navy ground.
 */
export default async function AppShell({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const [{ count: pending }, { count: webOrders }, { count: unread }, priceList, botSetting] = await Promise.all([
    db().from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db().from("orders").select("id", { count: "exact", head: true }).in("status", ["awaiting_confirmation", "awaiting_payment_verification"]).eq("source", "website"),
    db().from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).neq("priority", "quiet"),
    db().from("price_list_versions").select("status").order("version", { ascending: false }).limit(1).maybeSingle(),
    db().from("bot_settings").select("value").eq("key", "bot_on").maybeSingle(),
  ]);
  const badges = { "/admin/approvals": pending ?? 0, "/admin/orders": webOrders ?? 0, "/admin/notifications": unread ?? 0 };
  const botOn = (botSetting.data?.value as { on?: boolean } | undefined)?.on !== false;
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const draftPrices = priceList.data?.status !== "published";
  const collapsed = (await cookies()).get("kv_admin_nav")?.value === "collapsed";

  const footer = (
    <div className="border-t border-line px-4 py-4">
      <div className="flex items-center gap-3">
        <Avatar name={staff.display_name} size={34} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">{staff.display_name}</div>
          <div className="text-[11px] capitalize text-muted">{staff.role}</div>
        </div>
        <form action={signOut}>
          <button title="Sign out" aria-label="Sign out" className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-ink"><LogOut className="h-4 w-4" /></button>
        </form>
      </div>
      <Link href="/admin/pricing" className="mt-3 flex items-center gap-2 text-[12px] text-muted hover:text-ink">
        <span className={cx("h-1.5 w-1.5 rounded-full", draftPrices ? "bg-amber" : "bg-green")} />
        {draftPrices ? "Price list is still a draft" : "Price list published"}
      </Link>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      <Sidebar badges={badges} initialCollapsed={collapsed} footer={footer} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-void/80 px-4 backdrop-blur-xl lg:h-[72px] lg:px-8">
          <div className="flex items-center gap-3">
            <MobileNav badges={badges} footer={footer} />
            <div className="lg:hidden"><Wordmark compact /></div>
            <div className="hidden text-[13px] text-muted lg:block">
              {new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "long" })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <BotSwitch on={botOn} />
            <div className="md:hidden"><PushButton vapidKey={vapid} compact /></div>
            <div className="hidden md:block"><PushButton vapidKey={vapid} /></div>
            <BellLink unread={unread ?? 0} />
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 pb-28 pt-6 lg:px-8 lg:pb-14 lg:pt-8">
          <div className="mx-auto w-full max-w-[1320px]">{children}</div>
        </main>
      </div>
      <TabBar badges={badges} />
    </div>
  );
}

/** Owner's on/off switch for the Instagram bot: off while he's answering himself, on when he's away. */
function BotSwitch({ on }: { on: boolean }) {
  return (
    <form action={setBotOn}>
      <input type="hidden" name="on" value={on ? "0" : "1"} />
      <button
        title={on ? "The bot is answering Instagram DMs. Turn it off when you want to answer yourself." : "You're answering Instagram yourself. Turn the bot on when you're away."}
        className={cx("flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border pl-2 pr-3 text-sm font-semibold transition-colors",
          on ? "border-green/35 bg-green-soft text-ink" : "border-line-2 bg-raised/40 text-muted hover:text-ink")}>
        <span className={cx("relative h-5 w-9 rounded-full transition-colors", on ? "bg-green/80" : "bg-line-2")}>
          <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
        </span>
        <span className="hidden sm:inline">{on ? "Bot on" : "Bot off"}</span>
      </button>
    </form>
  );
}
