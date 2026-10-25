import { LogOut } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { signOut } from "../actions";
import { Wordmark } from "../ui";
import { Rail, TabBar, BellLink } from "./nav";
import PushButton from "./push-button";

export const dynamic = "force-dynamic";

/** Console layout: black page, wordmark bar, one framed panel holding the icon rail and the page. */
export default async function AppShell({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const [{ count: pending }, { count: unread }, priceList] = await Promise.all([
    db().from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db().from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).neq("priority", "quiet"),
    db().from("price_list_versions").select("status").order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const draftPrices = priceList.data?.status !== "published";
  return (
    <div className="flex min-h-dvh flex-col bg-void md:h-dvh md:px-7">
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-3 bg-void/90 px-4 backdrop-blur md:static md:h-[72px] md:px-0">
        <Wordmark />
        <div className="flex items-center gap-1.5">
          <div className="md:hidden"><PushButton vapidKey={vapid} compact /></div>
          <div className="hidden md:block"><PushButton vapidKey={vapid} /></div>
          <BellLink unread={unread ?? 0} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 md:rounded-xl md:border md:border-line md:bg-paper">
        <Rail pending={pending ?? 0} />
        <main className="min-w-0 flex-1 overflow-x-hidden px-4 pb-28 md:overflow-y-auto md:px-8 md:pb-12">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>

      <footer className="hidden h-12 shrink-0 items-center justify-between text-[13px] text-muted md:flex">
        <div className="flex items-center gap-3">
          <span>{staff.display_name}</span>
          <span className="text-line-2">|</span>
          <form action={signOut}><button className="inline-flex items-center gap-1.5 hover:text-ink"><LogOut className="h-3.5 w-3.5" />Sign out</button></form>
        </div>
        {draftPrices ? <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-amber" />Price list is still a draft</span> : <span>Price list published</span>}
      </footer>
      <TabBar pending={pending ?? 0} />
    </div>
  );
}
