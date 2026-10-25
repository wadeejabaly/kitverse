"use client";

import { useFormStatus } from "react-dom";
import { useRef } from "react";
import { SendHorizontal, LoaderCircle } from "lucide-react";
import { testChatSend } from "../../actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} aria-label="Send" className="inline-flex h-11 items-center gap-2 rounded-lg bg-pitch-fill px-4 text-sm font-medium text-white hover:bg-pitch-fill-2 disabled:opacity-60">
      {pending ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Bot is typing</> : <SendHorizontal className="h-4 w-4" />}
    </button>
  );
}

export default function SendBox() {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={async (fd) => { await testChatSend(fd); ref.current?.reset(); }}
      className="sticky bottom-20 mt-3 flex gap-2 rounded-xl border border-line bg-surface p-2 md:bottom-4">
      <input name="text" required autoComplete="off" placeholder="Message as a customer…" dir="auto"
        className="h-11 min-w-0 flex-1 rounded-xl bg-paper px-3 text-[15px] outline-none placeholder:text-muted/70 focus:ring-2 focus:ring-pitch/15" />
      <Submit />
    </form>
  );
}
