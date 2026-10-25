import "server-only";
import { db, must } from "./db";
import { notify, type Priority } from "./notify";
import { emit } from "@/inngest/emit";
import { EV } from "@/inngest/client";

export type ApprovalKind =
  | "discount" | "compensation" | "availability_check" | "custom_print" | "change_after_batch" | "cancellation"
  | "complaint" | "return" | "payment_exception" | "large_order" | "low_confidence" | "rate_limit" | "draft_reply" | "other";

const TITLES: Record<ApprovalKind, string> = {
  discount: "Discount request", compensation: "Compensation", availability_check: "Availability check", custom_print: "Custom print",
  change_after_batch: "Change after supplier batch", cancellation: "Cancellation", complaint: "Complaint", return: "Return",
  payment_exception: "Payment exception", large_order: "Large order", low_confidence: "Bot is unsure", rate_limit: "Limit reached",
  draft_reply: "Reply to approve", other: "Needs your decision",
};

export interface Approval {
  id: string; conversation_id: string | null; order_id: string | null; kind: ApprovalKind; priority: Priority;
  proposal: Record<string, unknown>; draft_reply: string | null; status: string; final_reply: string | null;
  decided_at: string | null; created_at: string;
}

export async function createApproval(a: {
  conversationId: string; orderId?: string | null; kind: ApprovalKind; summary: string;
  proposal?: Record<string, unknown>; draftReply?: string | null; priority?: Priority; customerLabel?: string;
}): Promise<Approval> {
  const priority = a.priority ?? (a.kind === "draft_reply" ? "urgent" : "urgent");
  const row = must(await db().from("approvals").insert({
    conversation_id: a.conversationId, order_id: a.orderId ?? null, kind: a.kind, priority,
    proposal: { summary: a.summary, ...(a.proposal ?? {}) }, draft_reply: a.draftReply ?? null,
    remind_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
  }).select("*").single(), "create approval") as Approval;
  await notify({
    kind: `approval.${a.kind}`, priority,
    title: `${TITLES[a.kind]}${a.customerLabel ? ` - ${a.customerLabel}` : ""}`,
    body: a.summary.slice(0, 180), link: `/admin/approvals/${row.id}`,
  });
  await emit(EV.approvalCreated, { approvalId: row.id, conversationId: a.conversationId }).catch(() => false);
  return row;
}

export async function pendingApprovals(conversationId: string): Promise<Approval[]> {
  return must(await db().from("approvals").select("*").eq("conversation_id", conversationId).eq("status", "pending").order("created_at"), "pending approvals") as Approval[];
}

/** Decisions made in the last 2 days that the bot should know about (shown in its state block). */
export async function recentDecisions(conversationId: string): Promise<Approval[]> {
  const since = new Date(Date.now() - 48 * 3600_000).toISOString();
  return must(await db().from("approvals").select("*").eq("conversation_id", conversationId).neq("status", "pending")
    .neq("kind", "draft_reply").gte("decided_at", since).order("decided_at"), "recent decisions") as Approval[];
}
