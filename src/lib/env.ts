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

  // PayPal (owner decision 2026-10-31, Part 7): optional, like every other
  // integration here — checkout simply doesn't offer PayPal until all three
  // are set. NEXT_PUBLIC_ is not used: nothing PayPal-specific ever reaches
  // the browser, the client only ever gets a redirect URL this server asked
  // PayPal to mint. PAYPAL_ENV defaults to sandbox; only the exact string
  // "live" switches it to the real API. PAYPAL_WEBHOOK_ID is required to
  // verify webhook callbacks (src/lib/payments/paypal.ts).
  PAYPAL_CLIENT_ID: z.string().optional().default(""),
  PAYPAL_SECRET: z.string().optional().default(""),
  PAYPAL_ENV: z.string().optional().default(""),
  PAYPAL_WEBHOOK_ID: z.string().optional().default(""),

  // PayPlus — the Israeli PSP that clears Bit (owner decision 2026-10-31,
  // Part 7). Whichever charge methods are enabled on the real
  // PAYPLUS_PAYMENT_PAGE_UID is what the hosted page actually offers; this
  // store only ever asks for "bit" at this layer (see the price-list /
  // checkout-UI naming) and leaves what PayPlus shows on its own hosted page
  // to the account's own configuration. PAYPLUS_ENV defaults to sandbox.
  PAYPLUS_API_KEY: z.string().optional().default(""),
  PAYPLUS_SECRET_KEY: z.string().optional().default(""),
  PAYPLUS_PAYMENT_PAGE_UID: z.string().optional().default(""),
  PAYPLUS_ENV: z.string().optional().default(""),
});

let cached: z.infer<typeof Env> | null = null;
export function env() {
  if (!cached) cached = Env.parse(process.env);
  return cached;
}
