/* eslint-disable @next/next/no-img-element */
import { Mic, Film, Reply, Megaphone, Share2, Bot, User, CircleAlert } from "lucide-react";
import { cx, ilTime } from "../ui";

export interface ThreadMsg {
  id: string; direction: "in" | "out"; sender: string; kind: string; text: string | null; transcript: string | null;
  media: { url?: string; title?: string; emoji?: string; ad_title?: string }[] | null; status: string; created_at: string;
}

const CONTEXT: Record<string, { label: string; icon: typeof Reply }> = {
  story_reply: { label: "Replied to a story", icon: Reply },
  share: { label: "Shared a post", icon: Share2 },
  ad_referral: { label: "From an ad", icon: Megaphone },
  audio: { label: "Voice note", icon: Mic },
  video: { label: "Video", icon: Film },
};

/** Scrollable chat window that opens at the newest message (column-reverse keeps it pinned to the bottom). */
export function ChatWindow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("flex flex-col-reverse overflow-y-auto overscroll-contain", className)}><div>{children}</div></div>;
}

/** Chat in Instagram style: customer left, bot (ink) / you (green) right; drafts dashed. */
export function Thread({ messages }: { messages: ThreadMsg[] }) {
  if (!messages.length) return <p className="py-6 text-center text-sm text-muted">No messages yet.</p>;
  return (
    <ol className="flex flex-col gap-1.5">
      {messages.map((m, i) => {
        const out = m.direction === "out";
        const prev = messages[i - 1];
        const firstOfRun = !prev || prev.direction !== m.direction || prev.sender !== m.sender;
        const ctx = CONTEXT[m.kind];
        if (m.kind === "reaction") {
          return <li key={m.id} className="self-start pl-2 text-xs text-muted">reacted {m.media?.[0]?.emoji ?? "👍"}</li>;
        }
        const images = (m.media ?? []).filter((x) => x.url && ["image", "story_reply", "share"].includes(m.kind));
        return (
          <li key={m.id} className={cx("flex max-w-[82%] flex-col gap-1", out ? "items-end self-end" : "items-start self-start", firstOfRun && i > 0 && "mt-2")}>
            {firstOfRun && out ? (
              <span className="flex items-center gap-1 px-1 text-[11px] text-muted">
                {m.sender === "owner" ? <><User className="h-3 w-3" /> You</> : <><Bot className="h-3 w-3" /> Bot</>}
              </span>
            ) : null}
            {ctx ? <span className="flex items-center gap-1 px-1 text-[11px] text-muted"><ctx.icon className="h-3 w-3" />{ctx.label}{m.media?.[0]?.ad_title ? ` · ${m.media[0].ad_title}` : ""}</span> : null}
            {images.map((x, k) => <img key={k} src={x.url} alt="" loading="lazy" className={cx("max-h-64 w-48 rounded-2xl border border-line bg-surface object-cover", m.status === "draft" && "opacity-70")} />)}
            {m.kind === "audio" && m.media?.[0]?.url ? <audio controls src={m.media[0].url} className="h-9 w-60" /> : null}
            {m.text || m.transcript ? (
              <div className={cx(
                "whitespace-pre-wrap rounded-[20px] px-3.5 py-2 text-[15px] leading-snug",
                out ? (m.sender === "owner" ? "bg-pitch-fill text-white" : "bg-line-2 text-ink") : "border border-line bg-surface text-ink",
                m.status === "draft" && "border-2 border-dashed border-amber/60 bg-amber-soft text-ink",
                m.status === "failed" && "ring-2 ring-red/50",
              )} dir="auto">
                {m.text}
                {m.transcript ? <span className="mt-1 block text-[13px] opacity-75">“{m.transcript}”</span> : null}
              </div>
            ) : null}
            <span className="flex items-center gap-1.5 px-1 text-[10px] text-muted">
              {ilTime(m.created_at)}
              {m.status === "draft" ? <span className="font-medium text-amber">· draft</span> : null}
              {m.status === "failed" ? <span className="flex items-center gap-0.5 font-medium text-red"><CircleAlert className="h-3 w-3" /> not sent</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
