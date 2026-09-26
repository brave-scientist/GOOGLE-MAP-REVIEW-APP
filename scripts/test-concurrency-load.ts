/**
 * scripts/test-concurrency-load.ts
 *
 * Controlled concurrency & saturation test for:
 * - /api/dashboard
 * - /api/analytics
 * - /api/audit-log
 * - /api/team/members
 * - /api/agency
 *
 * Verifies that with connection_limit=1 and concurrent incoming requests,
 * queries serialize cleanly through Prisma's connection pool without hung
 * connections or pool exhaustion crashes.
 */

import { PrismaClient, Plan, Role, ReviewSource, DraftStatus } from '@prisma/client'
import { encodeSession } from '../src/lib/session'
import { NextRequest } from 'next/server'
import { GET as getDashboardHandler } from '../src/app/api/dashboard/route'
import { GET as getAnalyticsHandler } from '../src/app/api/analytics/route'
import { GET as getAuditLogHandler } from '../src/app/api/audit-log/route'
import { GET as getTeamMembersHandler } from '../src/app/api/team/members/route'
import { GET as getAgencyHandler } from '../src/app/api/agency/route'

import crypto from 'crypto'
import { validateE2EDatabaseUrl } from '../e2e/fixtures/db-guard'

const E2E_DB_URL = validateE2EDatabaseUrl(process.env.E2E_DATABASE_URL || process.env.DATABASE_URL)
process.env.DATABASE_URL = E2E_DB_URL
process.env.SESSION_SECRET = process.env.TEST_SESSION_SECRET || crypto.randomBytes(32).toString('hex')

const prisma = new PrismaClient({ datasources: { db: { url: E2E_DB_URL } } })

async function runLoadTest() {
  console.log('================================================================')
  console.log(' STARTING CONCURRENCY & CONNECTION SATURATION LOAD TEST')
  console.log(` DB: ${E2E_DB_URL}`)
  console.log('================================================================\n')

  const testId = `load_${Date.now()}`

  let user: any = null
  let org: any = null
  let biz: any = null

  try {
    // Seed test tenant
    user = await prisma.user.create({
      data: {
        email: `${testId}@example.com`,
        name: 'Load Tester',
        sessionVersion: 1,
      },
    })
    org = await prisma.organization.create({
      data: {
        name: `${testId} Org`,
        plan: Plan.AGENCY,
      },
    })
    await prisma.orgMember.create({
      data: {
        orgId: org.id,
        userId: user.id,
        role: Role.OWNER,
      },
    })
    biz = await prisma.business.create({
    data: {
      orgId: org.id,
      ownerId: user.id,
      name: `${testId} Business`,
      slug: `${testId}-biz`,
      avgRating: 4.8,
      reviewCount: 10,
    },
  })

  // Seed 10 reviews
  const reviewData = []
  for (let i = 0; i < 10; i++) {
    reviewData.push({
      businessId: biz.id,
      author: `Customer ${i}`,
      rating: (i % 5) + 1,
      text: `Review text content for review ${i}`,
      source: ReviewSource.GOOGLE,
      externalId: `rev_${testId}_${i}`,
      sentimentScore: 0.5,
      topics: JSON.stringify(['service']),
      draftStatus: i % 2 === 0 ? DraftStatus.POSTED : DraftStatus.PENDING,
      repliedAt: i % 2 === 0 ? new Date() : null,
      createdAt: new Date(Date.now() - i * 86400000),
    })
  }
  await prisma.review.createMany({ data: reviewData })

  const token = await encodeSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: Role.OWNER,
    orgId: org.id,
    orgName: org.name,
    orgPlan: org.plan,
    sessionVersion: 1,
  })
  const cookie = `rr_session=${token}`

  function makeReq(path: string) {
    return new NextRequest(`http://localhost:3000${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
        'x-forwarded-for': '127.0.0.1',
      },
    })
  }

  // Concurrency rounds:
  // Execute batches of parallel requests across all 5 key routes
  const routes = [
    { name: 'Dashboard', fn: () => getDashboardHandler(makeReq('/api/dashboard')) },
    { name: 'Analytics', fn: () => getAnalyticsHandler(makeReq('/api/analytics')) },
    { name: 'Audit Log', fn: () => getAuditLogHandler(makeReq('/api/audit-log?limit=25')) },
    { name: 'Team Members', fn: () => getTeamMembersHandler(makeReq('/api/team/members')) },
    { name: 'Agency', fn: () => getAgencyHandler(makeReq('/api/agency')) },
  ]

  const CONCURRENT_WAVES = 5
  const REQUESTS_PER_WAVE = 15 // 3 requests per route concurrently

  let totalSuccessful = 0
  let totalFailed = 0
  let totalSaturationErrors = 0
  const latencies: number[] = []

  console.log(`Running ${CONCURRENT_WAVES} waves of ${REQUESTS_PER_WAVE} concurrent requests (${CONCURRENT_WAVES * REQUESTS_PER_WAVE} total requests)...`)

  for (let wave = 1; wave <= CONCURRENT_WAVES; wave++) {
    const waveStartTime = Date.now()
    const promises: Promise<void>[] = []

    for (let i = 0; i < REQUESTS_PER_WAVE; i++) {
      const route = routes[i % routes.length]
      const p = (async () => {
        const start = Date.now()
        try {
          const res = await route.fn()
          const duration = Date.now() - start
          latencies.push(duration)
          if (res.status === 200) {
            totalSuccessful++
          } else {
            totalFailed++
            if (res.status === 503) {
              totalSaturationErrors++
            }
          }
        } catch (e: any) {
          totalFailed++
          console.error(`  Error in ${route.name}:`, e.message)
        }
      })()
      promises.push(p)
    }

    await Promise.all(promises)
    const waveDuration = Date.now() - waveStartTime
    console.log(`  Wave ${wave}/${CONCURRENT_WAVES} completed in ${waveDuration}ms`)
  }

    const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)]
    const maxLatency = Math.max(...latencies)

    console.log('\n-- LOAD TEST RESULTS --')
    console.log(`  Total requests:     ${totalSuccessful + totalFailed}`)
    console.log(`  Successful (200):   ${totalSuccessful}`)
    console.log(`  Failed (non-200):   ${totalFailed}`)
    console.log(`  Saturation (503):   ${totalSaturationErrors}`)
    console.log(`  Average Latency:    ${avgLatency}ms`)
    console.log(`  P95 Latency:        ${p95Latency}ms`)
    console.log(`  Max Latency:        ${maxLatency}ms`)

    if (totalFailed > 0 || totalSaturationErrors > 0) {
      console.error('\n[FAIL] Load test had failures or saturation errors!')
      process.exit(1)
    } else {
      console.log('\n[PASS] Load test passed with ZERO errors and ZERO saturation failures!')
    }
  } finally {
    // Cleanup guaranteed even on error
    if (biz?.id) {
      await prisma.review.deleteMany({ where: { businessId: biz.id } }).catch(() => {})
      await prisma.business.deleteMany({ where: { id: biz.id } }).catch(() => {})
    }
    if (user?.id) {
      await prisma.orgMember.deleteMany({ where: { userId: user.id } }).catch(() => {})
      await prisma.user.deleteMany({ where: { id: user.id } }).catch(() => {})
    }
    if (org?.id) {
      await prisma.organization.deleteMany({ where: { id: org.id } }).catch(() => {})
    }
  }
}

runLoadTest()
  .catch(err => {
    console.error('Load test runner failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
