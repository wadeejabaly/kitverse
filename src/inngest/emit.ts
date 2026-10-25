import { inngest } from "./client";

/**
 * Send a job event. Only when a job runner exists (Vercel, or the local Inngest dev server with
 * INNGEST_DEV=1); the local CLI simulator runs turns directly and skips this.
 */
export async function emit(name: string, data: Record<string, unknown>): Promise<boolean> {
  if (!process.env.VERCEL && process.env.INNGEST_DEV !== "1") return false;
  await inngest.send({ name, data });
  return true;
}
