import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { db } from "@/lib/db";
import { markNotificationsRead } from "../../actions";
import { PageHeader, Card, EmptyState, button, cx, timeAgo } from "../../ui";

export const dynamic = "force-dynamic";

export default async function Notifications() {
  const { data } = await db().from("notifications").select("id,priority,title,body,link,read_at,created_at").order("created_at", { ascending: false }).limit(60);
  const rows = data ?? [];
  return (
    <>
      <PageHeader title="Notifications" actions={rows.some((n) => !n.read_at) ? <form action={markNotificationsRead}><button className={button.ghost}><CheckCheck className="h-4 w-4" /> Mark all read</button></form> : null} />
      {!rows.length ? <EmptyState icon={Bell} title="No notifications" /> : (
        <Card padded={false} className="divide-y divide-line overflow-hidden">
          {rows.map((n) => (
            <Link key={n.id} href={n.link ?? "/admin"} className={cx("flex gap-3 px-4 py-3.5 hover:bg-raised sm:px-5", n.read_at && "opacity-55")}>
              <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : n.priority === "urgent" ? "bg-red" : "bg-pitch")} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium" dir="auto">{n.title}</div>
                {n.body ? <p className="mt-0.5 line-clamp-2 text-sm text-muted" dir="auto">{n.body}</p> : null}
              </div>
              <span className="shrink-0 text-xs text-muted">{timeAgo(n.created_at)}</span>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
