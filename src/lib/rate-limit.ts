// src/lib/rate-limit.ts — Multi-instance distributed rate limiter with @upstash/redis & in-memory fallback
import { Redis } from '@upstash/redis'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

interface RateLimitEntry {
  count: number
  resetAt: number
}

const inMemoryStore = new Map<string, RateLimitEntry>()

// Clean up expired in-memory entries periodically
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of inMemoryStore.entries()) {
      if (entry.resetAt < now) {
        inMemoryStore.delete(key)
      }
    }
  }, 5 * 60 * 1000)
  if (timer && typeof timer === 'object' && 'unref' in timer && typeof (timer as any).unref === 'function') {
    ;(timer as any).unref()
  }
}

/**
 * In-memory token bucket rate limiter for local development, test suites, or Redis fallback
 */
export function inMemoryRateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now()
  const key = identifier

  const existing = inMemoryStore.get(key)

  if (!existing || existing.resetAt < now) {
    // First request or window expired
    inMemoryStore.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs }
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt }
  }

  existing.count++
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt }
}

/**
 * Clear in-memory store (for testing purposes)
 */
export function _clearInMemoryStore(): void {
  inMemoryStore.clear()
}

let lastConfig: { url: string; token: string } | null = null
let redisClient: Redis | null = null

/**
 * Get or initialize the @upstash/redis client if credentials exist in the environment
 */
export function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim()
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()

  if (!url || !token) {
    redisClient = null
    lastConfig = null
    return null
  }

  if (!redisClient || lastConfig?.url !== url || lastConfig?.token !== token) {
    lastConfig = { url, token }
    redisClient = new Redis({ url, token })
  }

  return redisClient
}

/**
 * Execute atomic Redis-backed rate limiting using pipeline incr and pttl
 */
async function redisRateLimit(
  client: Redis,
  identifier: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const key = `rl:${identifier}`
  const pipe = client.pipeline()
  pipe.incr(key)
  pipe.pttl(key)

  // Enforce a strict 1500ms timeout on Redis calls to prevent slow lambdas
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Upstash Redis rate limit timeout')), 1500)
  })

  const results = await Promise.race([
    pipe.exec<[number, number]>(),
    timeoutPromise,
  ])

  const count = Number(results[0])
  let pttl = Number(results[1])

  // If key is newly created or missing TTL, set expiration
  if (count === 1 || pttl <= 0) {
    try {
      await Promise.race([
        client.pexpire(key, windowMs),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('pexpire timeout')), 1000)
        }),
      ])
      pttl = windowMs
    } catch {
      pttl = windowMs
    }
  }

  const resetAt = Date.now() + (pttl > 0 ? pttl : windowMs)
  const allowed = count <= limit
  const remaining = Math.max(0, limit - count)

  return { allowed, remaining, resetAt }
}

/**
 * Primary rate limiter entrypoint:
 * 1. Uses distributed Upstash Redis if UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set.
 * 2. Seamlessly falls back to in-memory rate limiting if Redis is not configured or encounters errors/timeouts.
 */
export async function rateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const redis = getRedisClient()

  if (redis) {
    try {
      return await redisRateLimit(redis, identifier, limit, windowMs)
    } catch (error) {
      console.warn(
        `[RateLimit] Upstash Redis error (${error instanceof Error ? error.message : String(error)}), falling back to in-memory store.`
      )
      return inMemoryRateLimit(identifier, limit, windowMs)
    }
  }

  return inMemoryRateLimit(identifier, limit, windowMs)
}

// Helper: get client IP from request
export function getClientIP(request: Request | { headers: Headers }): string {
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
  forgotPassword: { limit: 3, windowMs: 15 * 60 * 1000 }, // 3 per 15 min per email
  login: { limit: 5, windowMs: 5 * 60 * 1000 }, // 5 per 5 min per IP
  signup: { limit: 3, windowMs: 60 * 60 * 1000 }, // 3 per hour per IP
  contact: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5 per hour per IP
  reviewRequest: { limit: 100, windowMs: 60 * 1000 }, // 100 per min per IP
  widget: { limit: 100, windowMs: 60 * 1000 }, // 100 per min per IP
}

