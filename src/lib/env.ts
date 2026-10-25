import "server-only";
import { z } from "zod";

/** Server-side configuration. Optional integrations are allowed to be empty; code checks before use. */
const Env = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  ANTHROPIC_API_KEY: z.string().min(20),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  NEXT_PUBLIC_SITE_URL: z.string().default("http://localhost:3000"),
  ORDER_LINK_SECRET: z.string().optional().default(""),
  META_APP_SECRET: z.string().optional().default(""),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional().default(""),
  BOT_VOICE_PASS: z.string().optional().default("on"),
  INSTAGRAM_ACCOUNT_ID: z.string().optional().default(""),
  INSTAGRAM_ACCESS_TOKEN: z.string().optional().default(""),
  IG_GRAPH_VERSION: z.string().default("v24.0"),
  ELEVENLABS_API_KEY: z.string().optional().default(""),
  OPENAI_API_KEY: z.string().optional().default(""),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional().default(""),
  VAPID_PRIVATE_KEY: z.string().optional().default(""),
  VAPID_SUBJECT: z.string().optional().default(""),
  // Vercel deploy hook: rebuilds the website so owner-uploaded photos appear (the catalog is static)
  VERCEL_DEPLOY_HOOK_URL: z.string().optional().default(""),
});

let cached: z.infer<typeof Env> | null = null;
export function env() {
  if (!cached) cached = Env.parse(process.env);
  return cached;
}
