/* eslint-disable @next/next/no-img-element */
import { Vote, Download, Camera as Instagram } from "lucide-react";
import { db } from "@/lib/db";
import { SCHEDULE, type ScheduledPost } from "@/lib/channels/ig-publish";
import { markPollStory } from "../../stories-actions";
import { PageHeader, Card, Badge, EmptyState, type Tone } from "../../ui";
import { SubmitButton } from "../../submit-button";
import { CopyText } from "./copy";

export const dynamic = "force-dynamic";

const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

type State = "now" | "upcoming" | "posted" | "skipped" | "missed";
const BADGE: Record<State, [string, Tone]> = { now: ["Post it now", "amber"], upcoming: ["Upcoming", "neutral"], posted: ["Posted", "green"], skipped: ["Skipped", "neutral"], missed: ["Missed", "red"] };

/**
 * Poll stories (owner request 2026-11-14). Instagram's API can't put a poll sticker on a story, so these
 * aren't auto-posted: at their time the owner is alerted, saves the picture here, and posts it from the
 * Instagram app with a poll (question + two answers copied from this page).
 */
export default async function Stories() {
  const polls = SCHEDULE.filter((i): i is ScheduledPost & { poll: NonNullable<ScheduledPost["poll"]> } => !!i.poll);
  const { data } = await db().from("bot_settings").select("key,value").in("key", polls.map((p) => `ig_post:${p.id}`));
  const rows = new Map((data ?? []).map((r) => [r.key as string, (r.value ?? {}) as { status?: string }]));
  const now = Date.now();
  const items = polls.map((p) => {
    const s = rows.get(`ig_post:${p.id}`)?.status;
    const at = Date.parse(p.at);
    const state: State = s === "posted_by_owner" ? "posted" : s === "skipped" ? "skipped"
      : at > now ? "upcoming" : now - at <= 24 * 3600_000 ? "now" : "missed";
    return { ...p, state };
  });
  const order: State[] = ["now", "upcoming", "missed", "posted", "skipped"];
  items.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || (a.state === "upcoming" ? Date.parse(a.at) - Date.parse(b.at) : Date.parse(b.at) - Date.parse(a.at)));
  const shown = items.filter((i) => i.state !== "upcoming" || Date.parse(i.at) - now < 7 * 24 * 3600_000);

  return (
    <>
      <PageHeader eyebrow="Instagram" title="Poll stories"
        subtitle="Instagram doesn't let apps add a poll to a story, so these are the ones you post yourself. At each one's time you get an alert: save the picture, open Instagram, add it as a story, add the Poll sticker and paste the question and the two answers. Every other post and story still goes up by itself." />
      {!shown.length ? <EmptyState icon={Vote} title="No poll stories coming up" /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((s) => {
            const [label, tone] = BADGE[s.state];
            return (
              <Card key={s.id} padded={false} accent={s.state === "now" ? "amber" : undefined} className="flex scroll-mt-24 flex-col overflow-hidden sm:flex-row">
                <div id={s.id} className="relative shrink-0 bg-paper sm:w-44">
                  <img src={s.image} alt="" className="mx-auto h-72 w-auto object-contain sm:h-full sm:w-full sm:object-cover" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{when(s.at)}</span>
                    <Badge tone={tone}>{label}</Badge>
                  </div>
                  <CopyText label="Poll question" text={s.poll.question} />
                  <div className="grid grid-cols-2 gap-2">
                    <CopyText label="Answer 1" text={s.poll.options[0]} />
                    <CopyText label="Answer 2" text={s.poll.options[1]} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <a href={s.image} download={`${s.id}.jpg`} className="inline-flex items-center gap-1.5 rounded-xl border border-line-2 px-3 py-2 text-sm"><Download className="h-4 w-4" />Save picture</a>
                    <a href="instagram://story-camera" className="inline-flex items-center gap-1.5 rounded-xl bg-pitch-fill px-3 py-2 text-sm font-semibold text-white"><Instagram className="h-4 w-4" />Open Instagram</a>
                  </div>
                  <form action={markPollStory} className="flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    {s.state === "posted" || s.state === "skipped"
                      ? <SubmitButton bare name="status" value="reset" className="rounded-xl border border-line-2 px-3 py-2 text-sm text-muted">Undo</SubmitButton>
                      : <>
                          <SubmitButton bare name="status" value="posted_by_owner" className="rounded-xl bg-green px-3 py-2 text-sm font-semibold text-white">I posted it</SubmitButton>
                          <SubmitButton bare name="status" value="skipped" className="rounded-xl border border-line-2 px-3 py-2 text-sm text-muted">Skip</SubmitButton>
                        </>}
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
