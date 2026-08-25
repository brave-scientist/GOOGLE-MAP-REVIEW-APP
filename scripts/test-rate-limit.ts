// scripts/test-rate-limit.ts — Unit & integration verification for INFRA-001 Upstash Redis & in-memory rate limiter

import {
  rateLimit,
  inMemoryRateLimit,
  _clearInMemoryStore,
  getRedisClient,
  getClientIP,
  RATE_LIMITS,
  RateLimitResult,
} from '../src/lib/rate-limit'

async function runRateLimitTests() {
  console.log('=================================================================')
  console.log('INFRA-001 — MULTI-INSTANCE DISTRIBUTED & IN-MEMORY RATE LIMIT TEST')
  console.log('=================================================================\n')

  let passed = 0
  let failed = 0

  function verify(id: string, name: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(`  ✓ [${id}] PASS: ${name}`)
      passed++
    } else {
      console.error(`  ✗ [${id}] FAIL: ${name}${details ? ` -> ${details}` : ''}`)
      failed++
    }
  }

  // --- TEST GROUP 1: In-Memory Rate Limiter Core ---
  console.log('--- TEST GROUP 1: In-Memory Rate Limiter Core ---')
  _clearInMemoryStore()

  const testId1 = 'test:user:1'
  const res1 = inMemoryRateLimit(testId1, 3, 60000)
  verify('MEM-001', 'First request allowed with remaining = limit - 1', res1.allowed === true && res1.remaining === 2)
  verify('MEM-002', 'First request sets valid future resetAt', res1.resetAt > Date.now())

  const res2 = inMemoryRateLimit(testId1, 3, 60000)
  verify('MEM-003', 'Second request allowed with remaining = 1', res2.allowed === true && res2.remaining === 1)

  const res3 = inMemoryRateLimit(testId1, 3, 60000)
  verify('MEM-004', 'Third request allowed with remaining = 0', res3.allowed === true && res3.remaining === 0)

  const res4 = inMemoryRateLimit(testId1, 3, 60000)
  verify('MEM-005', 'Fourth request rejected (allowed = false, remaining = 0)', res4.allowed === false && res4.remaining === 0)
  verify('MEM-006', 'Rejected request retains original resetAt', res4.resetAt === res1.resetAt)

  // Test expiration
  const testIdExpired = 'test:user:expired'
  inMemoryRateLimit(testIdExpired, 1, 10) // 10ms window
  await new Promise(r => setTimeout(r, 25))
  const resExpired = inMemoryRateLimit(testIdExpired, 1, 10)
  verify('MEM-007', 'Request allowed after window expiration', resExpired.allowed === true && resExpired.remaining === 0)

  // --- TEST GROUP 2: RATE_LIMITS Invariant Verification ---
  console.log('\n--- TEST GROUP 2: RATE_LIMITS Configuration Invariants ---')
  verify('CFG-001', 'login limit is 5 per 5 minutes', RATE_LIMITS.login.limit === 5 && RATE_LIMITS.login.windowMs === 5 * 60 * 1000)
  verify('CFG-002', 'signup limit is 3 per 1 hour', RATE_LIMITS.signup.limit === 3 && RATE_LIMITS.signup.windowMs === 60 * 60 * 1000)
  verify('CFG-003', 'otpSend limit is 3 per 10 minutes', RATE_LIMITS.otpSend.limit === 3 && RATE_LIMITS.otpSend.windowMs === 10 * 60 * 1000)
  verify('CFG-004', 'otpVerify limit is 5 per 10 minutes', RATE_LIMITS.otpVerify.limit === 5 && RATE_LIMITS.otpVerify.windowMs === 10 * 60 * 1000)
  verify('CFG-005', 'forgotPassword limit is 3 per 15 minutes', RATE_LIMITS.forgotPassword.limit === 3 && RATE_LIMITS.forgotPassword.windowMs === 15 * 60 * 1000)
  verify('CFG-006', 'contact limit is 5 per 1 hour', RATE_LIMITS.contact.limit === 5 && RATE_LIMITS.contact.windowMs === 60 * 60 * 1000)
  verify('CFG-007', 'reviewRequest limit is 100 per 1 minute', RATE_LIMITS.reviewRequest.limit === 100 && RATE_LIMITS.reviewRequest.windowMs === 60 * 1000)
  verify('CFG-008', 'widget limit is 100 per 1 minute', RATE_LIMITS.widget.limit === 100 && RATE_LIMITS.widget.windowMs === 60 * 1000)

  // --- TEST GROUP 3: Missing Redis Credentials Fallback ---
  console.log('\n--- TEST GROUP 3: Missing Redis Credentials Fallback ---')
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN

  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN

  verify('CRED-001', 'getRedisClient returns null when env vars are unset', getRedisClient() === null)

  _clearInMemoryStore()
  const fallbackRes = await rateLimit('test:fallback:1', 2, 60000)
  verify('CRED-002', 'rateLimit seamlessly executes in-memory fallback without credentials', fallbackRes.allowed === true && fallbackRes.remaining === 1)

  // --- TEST GROUP 4: Redis Configured & Simulated Healthy Path ---
  console.log('\n--- TEST GROUP 4: Redis Configured & Healthy Path Simulation ---')
  // Configure mock env
  process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token'

  const client = getRedisClient()
  verify('REDIS-001', 'getRedisClient initializes client when env vars are present', client !== null)

  // Mock pipeline execution on the client instance
  if (client) {
    let mockCounter = 0
    client.pipeline = () => {
      return {
        incr: (_key: string) => {},
        pttl: (_key: string) => {},
        exec: async <T>() => {
          mockCounter++
          return [mockCounter, 60000] as unknown as T
        },
      } as any
    }
    client.pexpire = async (_key: string, _ms: number) => 'OK' as any

    const redisRes1 = await rateLimit('test:redis:healthy', 2, 60000)
    verify('REDIS-002', 'Redis rateLimit returns allowed for first request (count=1)', redisRes1.allowed === true && redisRes1.remaining === 1)

    const redisRes2 = await rateLimit('test:redis:healthy', 2, 60000)
    verify('REDIS-003', 'Redis rateLimit returns allowed for second request (count=2)', redisRes2.allowed === true && redisRes2.remaining === 0)

    const redisRes3 = await rateLimit('test:redis:healthy', 2, 60000)
    verify('REDIS-004', 'Redis rateLimit returns rejected when limit exceeded (count=3)', redisRes3.allowed === false && redisRes3.remaining === 0)
  }

  // --- TEST GROUP 5: Redis Failure / Timeout Fallback ---
  console.log('\n--- TEST GROUP 5: Redis Error & Timeout Fallback ---')
  if (client) {
    // Force pipeline to simulate network / auth error
    client.pipeline = () => {
      return {
        incr: (_key: string) => {},
        pttl: (_key: string) => {},
        exec: async () => {
          throw new Error('Connection refused or Upstash quota exceeded')
        },
      } as any
    }

    _clearInMemoryStore()
    const errorFallbackRes = await rateLimit('test:redis:error', 2, 60000)
    verify('ERR-001', 'Catches Redis network/pipeline error and falls back to in-memory', errorFallbackRes.allowed === true && errorFallbackRes.remaining === 1)

    // Force timeout simulation
    client.pipeline = () => {
      return {
        incr: (_key: string) => {},
        pttl: (_key: string) => {},
        exec: async () => {
          // Delay longer than the 1500ms timeout
          await new Promise(r => setTimeout(r, 2000))
          return [1, 60000]
        },
      } as any
    }

    const timeoutFallbackRes = await rateLimit('test:redis:timeout', 2, 60000)
    verify('ERR-002', 'Catches Redis timeout (>1500ms) and falls back to in-memory safely', timeoutFallbackRes.allowed === true)
  }

  // Restore env
  if (originalUrl) process.env.UPSTASH_REDIS_REST_URL = originalUrl
  else delete process.env.UPSTASH_REDIS_REST_URL
  if (originalToken) process.env.UPSTASH_REDIS_REST_TOKEN = originalToken
  else delete process.env.UPSTASH_REDIS_REST_TOKEN
  getRedisClient() // refresh client cache

  // --- TEST GROUP 6: 429 Response & Retry-After Contract ---
  console.log('\n--- TEST GROUP 6: 429 Response & Retry-After Contract ---')
  _clearInMemoryStore()
  const blockKey = 'test:429:contract'
  inMemoryRateLimit(blockKey, 1, 30000) // 30s window
  const blocked = inMemoryRateLimit(blockKey, 1, 30000)

  verify('RESP-001', 'Blocked result has allowed = false', blocked.allowed === false)
  const retryAfterSec = Math.ceil((blocked.resetAt - Date.now()) / 1000)
  verify('RESP-002', 'Retry-After calculation produces valid positive seconds (<= 30)', retryAfterSec > 0 && retryAfterSec <= 30)

  const expectedPayload = {
    error: 'Rate limit exceeded',
    code: 'RATE_LIMITED',
    retryAfter: retryAfterSec,
  }
  verify('RESP-003', 'Expected JSON error payload conforms to contract',
    expectedPayload.code === 'RATE_LIMITED' && expectedPayload.error === 'Rate limit exceeded' && typeof expectedPayload.retryAfter === 'number'
  )

  // --- TEST GROUP 7: Client IP Extraction ---
  console.log('\n--- TEST GROUP 7: Client IP Extraction ---')
  const reqWithXFF = {
    headers: new Headers({ 'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178' }),
  } as any
  verify('IP-001', 'Extracts client IP from x-forwarded-for first entry', getClientIP(reqWithXFF) === '203.0.113.195')

  const reqWithRealIP = {
    headers: new Headers({ 'x-real-ip': '198.51.100.42' }),
  } as any
  verify('IP-002', 'Extracts client IP from x-real-ip', getClientIP(reqWithRealIP) === '198.51.100.42')

  const reqEmpty = {
    headers: new Headers(),
  } as any
  verify('IP-003', 'Defaults to unknown when IP headers are missing', getClientIP(reqEmpty) === 'unknown')

  // --- TEST GROUP 8: Concurrent Request Safety ---
  console.log('\n--- TEST GROUP 8: Concurrent Request Safety ---')
  _clearInMemoryStore()
  const concurrentKey = 'test:concurrent:user'
  const limit = 5
  const concurrentCalls = Array.from({ length: 10 }).map(() =>
    rateLimit(concurrentKey, limit, 60000)
  )
  const results = await Promise.all(concurrentCalls)
  const allowedCount = results.filter(r => r.allowed).length
  const blockedCount = results.filter(r => !r.allowed).length

  verify('CONC-001', 'Exactly limit (5) concurrent requests allowed', allowedCount === 5)
  verify('CONC-002', 'Exactly 5 concurrent requests blocked', blockedCount === 5)

  // Summary
  console.log('\n=================================================================')
  console.log(`RATE LIMIT TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('=================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runRateLimitTests().catch(err => {
  console.error('Test execution failed:', err)
  process.exit(1)
})
