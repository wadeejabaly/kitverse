/**
 * A best-effort token bucket, per IP, in memory.
 *
 * BE HONEST ABOUT WHAT THIS IS. The bucket lives in one server instance's
 * memory: it resets on a cold start, and a horizontally scaled deployment
 * gets one bucket per instance, so the effective limit is the configured rate
 * times the number of live instances. It raises the cost of hammering the
 * order-creation endpoint from a script; it is NOT a security control and
 * must never be the only thing standing between an attacker and something
 * that matters. Durable limiting (an edge/WAF rule or a shared store) is a
 * hardening-wave item.
 *
 * It is deliberately NOT applied to the PayPal webhook. Dropping a real
 * capture event because a burst of deliveries tripped a counter would lose an
 * order that has already been paid for — the one failure mode worse than
 * being rate-limited.
 */

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

/** Stop the map growing without bound on a long-lived instance. */
const MAX_TRACKED_KEYS = 5_000;

export interface RateLimitOptions {
  /** Bucket size — the largest burst allowed. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
}

export interface RateLimitVerdict {
  allowed: boolean;
  /** Whole seconds until the next token, for a Retry-After header. */
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  options: RateLimitOptions,
  now: number = Date.now(),
): RateLimitVerdict {
  if (buckets.size > MAX_TRACKED_KEYS) buckets.clear();

  const bucket = buckets.get(key) ?? { tokens: options.capacity, updatedAt: now };
  const elapsedSeconds = Math.max(0, (now - bucket.updatedAt) / 1000);
  const tokens = Math.min(
    options.capacity,
    bucket.tokens + elapsedSeconds * options.refillPerSecond,
  );

  if (tokens < 1) {
    buckets.set(key, { tokens, updatedAt: now });
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / options.refillPerSecond)),
    };
  }

  buckets.set(key, { tokens: tokens - 1, updatedAt: now });
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * The client's IP as the proxy reported it. Spoofable in principle — which is
 * fine, given what this limiter is and is not (see the note above).
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? "unknown";
}

/** Test seam. */
export function resetRateLimits(): void {
  buckets.clear();
}
