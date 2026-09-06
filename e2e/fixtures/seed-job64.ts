/**
 * JOB-6.3 — JOB-6.4 Test Data Seed
 *
 * Creates the MINIMAL disposable dataset required for DEF-01/02/03 E2E tests.
 * Uses the existing seedTestTenant() and seedTestReview() infrastructure.
 *
 * Dataset:
 *   Organization A -> User A -> Business A ("Alpha Test Restaurant")
 *     - 2 reviews with DraftStatus.PENDING -> pendingReplies = 2
 *
 *   Organization B -> User B -> Business B ("Beta Test Restaurant")
 *     - 5 reviews with DraftStatus.PENDING -> pendingReplies = 5
 *
 * Business A and Business B are owned by DIFFERENT organizations.
 * Cross-tenant isolation is enforced by getTenantContext() in the app.
 *
 * Usage (from e2e test setup):
 *   const data = await seedJob64Dataset()
 *   // data.tenantA.business.id  -> Business A id
 *   // data.tenantB.business.id  -> Business B id
 *   // data.tenantA.user.email + data.tenantA.rawPassword -> User A credentials
 *   // data.tenantB.user.email + data.tenantB.rawPassword -> User B credentials
 *
 * Cleanup:
 *   await cleanupJob64Dataset(data)
 */

import { DraftStatus, ReviewSource } from '@prisma/client'
import {
  prisma,
  seedTestTenant,
  seedTestReview,
  cleanupTestTenant,
  type TestSeedResult,
} from './db-seed'

export interface Job64Dataset {
  tenantA: TestSeedResult
  tenantB: TestSeedResult
  reviewIdsA: string[]
  reviewIdsB: string[]
  expectedPendingA: number
  expectedPendingB: number
}

/**
 * Seed the full JOB-6.4 test dataset.
 * Call once per test suite in beforeAll().
 */
export async function seedJob64Dataset(): Promise<Job64Dataset> {
  // --- Tenant A ---
  const tenantA = await seedTestTenant({
    email: `job64_user_a_${Date.now()}@example-test.local`,
    password: 'TestJob64A!',
    name: 'Job64 User Alpha',
    businessName: 'Alpha Test Restaurant',
  })

  // 2 pending reviews for Business A
  const reviewsA: string[] = []
  for (let i = 0; i < 2; i++) {
    const r = await seedTestReview(tenantA.business.id, {
      author: `Alpha Reviewer ${i + 1}`,
      rating: 4,
      text: `Alpha Test Restaurant review #${i + 1} — pending reply needed.`,
      title: 'Great food',
      source: ReviewSource.GOOGLE,
      draftStatus: DraftStatus.PENDING,
      draftText: `Draft reply for Alpha review #${i + 1}`,
      externalId: `job64_alpha_${tenantA.business.id}_${i}_${Date.now()}`,
    })
    reviewsA.push(r.id)
  }

  // --- Tenant B ---
  const tenantB = await seedTestTenant({
    email: `job64_user_b_${Date.now()}@example-test.local`,
    password: 'TestJob64B!',
    name: 'Job64 User Beta',
    businessName: 'Beta Test Restaurant',
  })

  // 5 pending reviews for Business B
  const reviewsB: string[] = []
  for (let i = 0; i < 5; i++) {
    const r = await seedTestReview(tenantB.business.id, {
      author: `Beta Reviewer ${i + 1}`,
      rating: 3,
      text: `Beta Test Restaurant review #${i + 1} — pending reply needed.`,
      title: 'Average experience',
      source: ReviewSource.GOOGLE,
      draftStatus: DraftStatus.PENDING,
      draftText: `Draft reply for Beta review #${i + 1}`,
      externalId: `job64_beta_${tenantB.business.id}_${i}_${Date.now()}`,
    })
    reviewsB.push(r.id)
  }

  return {
    tenantA,
    tenantB,
    reviewIdsA: reviewsA,
    reviewIdsB: reviewsB,
    expectedPendingA: 2,
    expectedPendingB: 5,
  }
}

/**
 * Verify seeded counts by querying DB directly.
 * Call after seedJob64Dataset() to confirm known counts are accurate.
 */
export async function verifyJob64Dataset(data: Job64Dataset): Promise<{
  pendingCountA: number
  pendingCountB: number
  orgAId: string
  orgBId: string
  businessAId: string
  businessBId: string
  tenantsIsolated: boolean
}> {
  const pendingCountA = await prisma.review.count({
    where: { businessId: data.tenantA.business.id, draftStatus: DraftStatus.PENDING },
  })
  const pendingCountB = await prisma.review.count({
    where: { businessId: data.tenantB.business.id, draftStatus: DraftStatus.PENDING },
  })

  const tenantsIsolated = data.tenantA.org.id !== data.tenantB.org.id

  return {
    pendingCountA,
    pendingCountB,
    orgAId: data.tenantA.org.id,
    orgBId: data.tenantB.org.id,
    businessAId: data.tenantA.business.id,
    businessBId: data.tenantB.business.id,
    tenantsIsolated,
  }
}

/**
 * Clean up ALL JOB-6.4 test data.
 * Call in afterAll() to leave the test DB clean.
 */
export async function cleanupJob64Dataset(data: Job64Dataset): Promise<void> {
  await cleanupTestTenant(data.tenantA.org.id)
  await cleanupTestTenant(data.tenantB.org.id)
}
