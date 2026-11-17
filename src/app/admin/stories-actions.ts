"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { db, must } from "@/lib/db";
import { SCHEDULE } from "@/lib/channels/ig-publish";

/**
 * The owner marks a poll story (one the API can't post - see ig-publish.ts) as posted by him, or skipped.
 * Upsert: marking it before its time also stops the cron from alerting about it later.
 */
export async function markPollStory(form: FormData) {
  const staff = await requireStaff();
  const id = z.string().min(1).parse(form.get("id"));
  const status = z.enum(["posted_by_owner", "skipped", "reset"]).parse(form.get("status"));
  if (!SCHEDULE.some((i) => i.id === id && (i.poll || i.manual))) throw new Error("not a story you post yourself");
  const key = `ig_post:${id}`;
  if (status === "reset") must(await db().from("bot_settings").update({ value: { status: "owner_poll", at: new Date().toISOString() } }).eq("key", key).select("key"), "reset poll story");
  else must(await db().from("bot_settings").upsert({ key, value: { status, at: new Date().toISOString(), by: staff.id } }).select("key"), "mark poll story");
  revalidatePath("/admin/stories");
}
