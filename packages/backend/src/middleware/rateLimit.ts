import type { Request, Response, NextFunction } from "express";

/**
 * Simple in-memory rate limiter.
 * Production: swap for Redis-backed token bucket.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 100;

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 300_000);

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();

  let entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    store.set(key, entry);
  }

  entry.count++;

  res.setHeader("X-RateLimit-Limit", MAX_REQUESTS);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, MAX_REQUESTS - entry.count));
  res.setHeader("X-RateLimit-Reset", entry.resetAt);

  if (entry.count > MAX_REQUESTS) {
    res.status(429).json({
      error: "Too many requests",
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    });
    return;
  }

  next();
}
