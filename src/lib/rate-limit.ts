// lib/rate-limit.ts — Simple in-memory rate limiter (no Redis dependency needed for dev)
// In production, swap for @upstash/redis — the interface is the same

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) {
      store.delete(key)
    }
  }
}, 5 * 60 * 1000)

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export function rateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now()
  const key = identifier

  const existing = store.get(key)

  if (!existing || existing.resetAt < now) {
    // First request or window expired
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs }
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt }
  }

  existing.count++
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt }
}

// Helper: get client IP from request
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }
  return 'unknown'
}

// Pre-configured rate limits for each endpoint type
export const RATE_LIMITS = {
  otpSend: { limit: 3, windowMs: 10 * 60 * 1000 }, // 3 per 10 min per email
  otpVerify: { limit: 5, windowMs: 10 * 60 * 1000 }, // 5 per 10 min per email
  login: { limit: 5, windowMs: 5 * 60 * 1000 }, // 5 per 5 min per IP
  signup: { limit: 3, windowMs: 60 * 60 * 1000 }, // 3 per hour per IP
  contact: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5 per hour per IP
  reviewRequest: { limit: 100, windowMs: 60 * 1000 }, // 100 per min per IP
  widget: { limit: 100, windowMs: 60 * 1000 }, // 100 per min per IP
}
