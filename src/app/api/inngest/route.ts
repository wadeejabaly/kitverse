import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

// Agent turns can take ~30s; allow long-running steps.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({ client: inngest, functions });
