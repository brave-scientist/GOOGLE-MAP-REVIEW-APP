/**
 * scripts/test-job14-org-governance.ts
 *
 * Dedicated verification suite for Milestone JOB-14:
 * Multi-Location Regional Operator Governance & Bulk Dispatch (ORG-02)
 *
 * Validates:
 *  1. Unauthenticated access rejected (401) across governance and bulk routes
 *  2. OWNER authorized for governance and multi-location operations
 *  3. ADMIN authorized for governance and multi-location operations
 *  4. Unauthorized STAFF access rejected where applicable (403 FORBIDDEN on governance mutations)
 *  5. VIEWER cannot mutate governance or execute bulk actions (403 FORBIDDEN)
 *  6. Tenant A cannot access Tenant B location groups or reviews (fail closed 404/403)
 *  7. Tenant A cannot assign Tenant B's users (400 CROSS_TENANT_USER)
 *  8. Operator cannot access unauthorized location reviews (403 LOCATION_FORBIDDEN)
 *  9. Authorized operator can access assigned location reviews (200 OK)
 * 10. Group creation (name, description, scoped to org)
 * 11. Group modification (name update, audit logged)
 * 12. Group deletion (cascades memberships)
 * 13. Location assignment to group (adds locations, audit logged)
 * 14. Location removal from group (removes location safely)
 * 15. Duplicate assignment handled safely without database error
 * 16. Bulk selection containing unauthorized review (reports unauthorized without aborting)
 * 17. Unauthorized review is never published
 * 18. Duplicate review IDs handled safely (deduplicated in batch)
 * 19. Already-posted review cannot be republished (reports SKIPPED ALREADY_POSTED)
 * 20. Concurrent bulk requests cannot double-claim a review (atomic claim check)
 * 21. Successful publish produces truthful success state (POSTED, SAVED_LOCALLY / LIVE)
 * 22. Failed publish produces truthful failure state (APPROVED, FAILED, NO_OAUTH_TOKEN)
 * 23. Ambiguous/network publish produces UNCONFIRMED state (APPROVED, UNCONFIRMED)
 * 24. Publish attempt records created with correct statuses
 * 25. Audit logs created for all governance mutations and bulk dispatches
 * 26. Organization isolation preserved across all queries and bulk dispatches
 * 27. Existing JOB-12 publishing behavior remains intact
 */

import { prisma, seedTestTenant, cleanupTestTenant, TestSeedResult } from '../e2e/fixtures/db-seed'
import { encodeSession, SESSION_COOKIE } from '../src/lib/session'
import { NextRequest } from 'next/server'
import { GET as getGroupsHandler, POST as postGroupsHandler } from '../src/app/api/governance/groups/route'
import { GET as getGroupDetailHandler, PUT as putGroupHandler, DELETE as deleteGroupHandler } from '../src/app/api/governance/groups/[id]/route'
import { POST as postGroupLocationsHandler, DELETE as deleteGroupLocationHandler } from '../src/app/api/governance/groups/[id]/locations/route'
import { GET as getOperatorsHandler, POST as postAssignOperatorHandler, DELETE as deleteOperatorAssignmentHandler } from '../src/app/api/governance/operators/route'
import { GET as getEffectiveScopeHandler } from '../src/app/api/governance/effective-scope/route'
import { GET as getInboxHandler } from '../src/app/api/inbox/route'
import { POST as postApproveHandler } from '../src/app/api/reviews/[id]/approve/route'
import { POST as postBulkActionHandler } from '../src/app/api/reviews/bulk-action/route'
import { Role, ReviewSource, DraftStatus, PublishAttemptStatus } from '@prisma/client'
import { encrypt } from '../src/lib/crypto'
import { resolveEffectiveScope } from '../src/lib/operator-governance'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`)
    passed++
  } else {
    console.error(`  ✗ FAIL: ${message}`)
    failed++
  }
}

async function createAuthRequest(
  url: string,
  tenant: TestSeedResult | null,
  method = 'GET',
  body?: any,
  overrideRole?: Role
): Promise<NextRequest> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (tenant) {
    const token = await encodeSession({
      id: tenant.user.id,
      email: tenant.user.email,
      name: tenant.user.name,
      role: overrideRole || tenant.membership.role,
      orgId: tenant.org.id,
      orgName: tenant.org.name,
      orgPlan: tenant.org.plan,
      sessionVersion: tenant.user.sessionVersion,
    })
    headers['cookie'] = `${SESSION_COOKIE}=${token}`
  }

  const reqInit: any = {
    method,
    headers,
  }
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
    reqInit.body = JSON.stringify(body)
  }

  return new NextRequest(new URL(url, 'http://localhost:3000'), reqInit)
}

async function run() {
  console.log('====================================================================')
  console.log('JOB-14 VERIFICATION SUITE: Multi-Location Regional Operator Governance & Bulk Dispatch (ORG-02)')
  console.log('====================================================================\n')

  let tenantA: TestSeedResult | null = null
  let tenantB: TestSeedResult | null = null

  try {
    // Delete any lingering test reviews with static externalIds
    await prisma.review.deleteMany({
      where: {
        externalId: {
          in: ['open_graph_story_fb_timeout_1'],
        },
      },
    })

    // Seed Tenant A (Owner)
    tenantA = await seedTestTenant({
      name: 'Alice OrgOwner',
      businessName: 'Alice Downtown Flagship',
    })

    // Seed additional locations for Tenant A
    const tenantALocation2 = await prisma.business.create({
      data: {
        orgId: tenantA.org.id,
        ownerId: tenantA.user.id,
        name: 'Alice North Branch',
        address: '100 North Ave',
      },
    })
    const tenantALocation3 = await prisma.business.create({
      data: {
        orgId: tenantA.org.id,
        ownerId: tenantA.user.id,
        name: 'Alice West Suburb',
        address: '200 West St',
      },
    })

    // Seed Tenant B (Completely isolated organization)
    tenantB = await seedTestTenant({
      name: 'Bob Competitor',
      businessName: 'Bob Rival Location',
    })

    // Create Admin user in Tenant A
    const adminUser = await prisma.user.create({
      data: { email: `admin_${Date.now()}@example.com`, name: 'Adam Admin' },
    })
    const adminMember = await prisma.orgMember.create({
      data: { userId: adminUser.id, orgId: tenantA.org.id, role: Role.ADMIN },
    })
    const adminTenant: TestSeedResult = { ...tenantA, user: adminUser, membership: adminMember }

    // Create Staff Operator user in Tenant A
    const staffUser = await prisma.user.create({
      data: { email: `staff_${Date.now()}@example.com`, name: 'Steve Staff' },
    })
    const staffMember = await prisma.orgMember.create({
      data: { userId: staffUser.id, orgId: tenantA.org.id, role: Role.STAFF },
    })
    const staffTenant: TestSeedResult = { ...tenantA, user: staffUser, membership: staffMember }

    // Create Viewer user in Tenant A
    const viewerUser = await prisma.user.create({
      data: { email: `viewer_${Date.now()}@example.com`, name: 'Vicky Viewer' },
    })
    const viewerMember = await prisma.orgMember.create({
      data: { userId: viewerUser.id, orgId: tenantA.org.id, role: Role.VIEWER },
    })
    const viewerTenant: TestSeedResult = { ...tenantA, user: viewerUser, membership: viewerMember }

    // ------------------------------------------------------------------
    // [Test 1] Unauthenticated Access Rejected
    // ------------------------------------------------------------------
    console.log('[Test 1] Unauthenticated Access Rejected')
    const unauthGroupsReq = await createAuthRequest('/api/governance/groups', null, 'GET')
    const unauthGroupsRes = await getGroupsHandler(unauthGroupsReq)
    assert(unauthGroupsRes.status === 401, 'Unauthenticated GET /api/governance/groups returns 401')

    const unauthBulkReq = await createAuthRequest('/api/reviews/bulk-action', null, 'POST', { reviewIds: ['r1'] })
    const unauthBulkRes = await postBulkActionHandler(unauthBulkReq)
    assert(unauthBulkRes.status === 401, 'Unauthenticated POST /api/reviews/bulk-action returns 401')

    // ------------------------------------------------------------------
    // [Test 2 & 3] OWNER and ADMIN Authorized
    // ------------------------------------------------------------------
    console.log('\n[Test 2 & 3] OWNER and ADMIN Governance Authorization')
    const ownerGroupsReq = await createAuthRequest('/api/governance/groups', tenantA, 'GET')
    const ownerGroupsRes = await getGroupsHandler(ownerGroupsReq)
    assert(ownerGroupsRes.status === 200, 'OWNER authorized to list groups (200)')

    const adminGroupsReq = await createAuthRequest('/api/governance/groups', adminTenant, 'GET')
    const adminGroupsRes = await getGroupsHandler(adminGroupsReq)
    assert(adminGroupsRes.status === 200, 'ADMIN authorized to list groups (200)')

    // ------------------------------------------------------------------
    // [Test 4 & 5] VIEWER & Unassigned STAFF Governance Mutation Rejected
    // ------------------------------------------------------------------
    console.log('\n[Test 4 & 5] VIEWER and STAFF Governance Mutation Restrictions')
    const viewerCreateReq = await createAuthRequest('/api/governance/groups', viewerTenant, 'POST', { name: 'Illegal Group' })
    const viewerCreateRes = await postGroupsHandler(viewerCreateReq)
    assert(viewerCreateRes.status === 403, 'VIEWER cannot create location group (403 FORBIDDEN)')

    const staffCreateReq = await createAuthRequest('/api/governance/groups', staffTenant, 'POST', { name: 'Staff Group' })
    const staffCreateRes = await postGroupsHandler(staffCreateReq)
    assert(staffCreateRes.status === 403, 'STAFF cannot create location group (403 FORBIDDEN)')

    const viewerBulkReq = await createAuthRequest('/api/reviews/bulk-action', viewerTenant, 'POST', { reviewIds: ['r1'] })
    const viewerBulkRes = await postBulkActionHandler(viewerBulkReq)
    assert(viewerBulkRes.status === 403, 'VIEWER cannot execute bulk actions (403 FORBIDDEN)')

    // ------------------------------------------------------------------
    // [Test 10] Group Creation
    // ------------------------------------------------------------------
    console.log('\n[Test 10] Location Group Creation')
    const createGroupReq = await createAuthRequest('/api/governance/groups', tenantA, 'POST', {
      name: 'Downtown Cluster',
      description: 'Downtown and Central metro locations',
      businessIds: [tenantA.business.id],
    })
    const createGroupRes = await postGroupsHandler(createGroupReq)
    assert(createGroupRes.status === 201, 'OWNER creates group successfully (201 Created)')
    const createdGroupData = await createGroupRes.json()
    const groupId = createdGroupData.group.id
    assert(createdGroupData.group.name === 'Downtown Cluster', 'Created group name verified')
    assert(createdGroupData.group.locationCount === 1, 'Initial location assigned to group')

    // Duplicate group name rejected
    const duplicateGroupReq = await createAuthRequest('/api/governance/groups', tenantA, 'POST', {
      name: 'Downtown Cluster',
    })
    const duplicateGroupRes = await postGroupsHandler(duplicateGroupReq)
    assert(duplicateGroupRes.status === 409, 'Duplicate group name in org rejected with 409 DUPLICATE_GROUP')

    // ------------------------------------------------------------------
    // [Test 11] Group Modification
    // ------------------------------------------------------------------
    console.log('\n[Test 11] Location Group Modification')
    const updateGroupReq = await createAuthRequest(`/api/governance/groups/${groupId}`, adminTenant, 'PUT', {
      name: 'Metro Flagship Group',
      description: 'Updated metro group description',
    })
    const updateGroupRes = await putGroupHandler(updateGroupReq, { params: Promise.resolve({ id: groupId }) })
    assert(updateGroupRes.status === 200, 'ADMIN modifies group successfully (200 OK)')
    const updatedGroupData = await updateGroupRes.json()
    assert(updatedGroupData.group.name === 'Metro Flagship Group', 'Updated group name persisted')

    // ------------------------------------------------------------------
    // [Test 13 & 14] Location Assignment & Removal from Group
    // ------------------------------------------------------------------
    console.log('\n[Test 13 & 14] Location Assignment & Removal')
    const assignLocReq = await createAuthRequest(`/api/governance/groups/${groupId}/locations`, tenantA, 'POST', {
      businessIds: [tenantALocation2.id, tenantALocation3.id],
    })
    const assignLocRes = await postGroupLocationsHandler(assignLocReq, { params: Promise.resolve({ id: groupId }) })
    assert(assignLocRes.status === 200, 'Assign locations to group returns 200')
    const assignLocData = await assignLocRes.json()
    assert(assignLocData.assignedCount === 2, '2 new locations added to group')

    // [Test 15] Duplicate assignment handled safely
    console.log('\n[Test 15] Duplicate Assignment Handled Safely')
    const dupAssignReq = await createAuthRequest(`/api/governance/groups/${groupId}/locations`, tenantA, 'POST', {
      businessIds: [tenantALocation2.id],
    })
    const dupAssignRes = await postGroupLocationsHandler(dupAssignReq, { params: Promise.resolve({ id: groupId }) })
    assert(dupAssignRes.status === 200, 'Duplicate location assignment handled idempotently (200)')
    const dupAssignData = await dupAssignRes.json()
    assert(dupAssignData.assignedCount === 0, 'Zero duplicate records inserted')

    // Remove location from group
    const removeLocReq = await createAuthRequest(`/api/governance/groups/${groupId}/locations`, tenantA, 'DELETE', {
      businessId: tenantALocation3.id,
    })
    const removeLocRes = await deleteGroupLocationHandler(removeLocReq, { params: Promise.resolve({ id: groupId }) })
    assert(removeLocRes.status === 200, 'Location removed from group (200)')

    // ------------------------------------------------------------------
    // [Test 6 & 7] Tenant Isolation & Cross-Tenant Protection
    // ------------------------------------------------------------------
    console.log('\n[Test 6 & 7] Tenant Isolation & Cross-Tenant Boundaries')
    // Tenant B attempts to access Tenant A's group
    const crossTenantGetReq = await createAuthRequest(`/api/governance/groups/${groupId}`, tenantB, 'GET')
    const crossTenantGetRes = await getGroupDetailHandler(crossTenantGetReq, { params: Promise.resolve({ id: groupId }) })
    assert(crossTenantGetRes.status === 404, 'Tenant B cannot view Tenant A group (404 NOT_FOUND)')

    // Tenant A attempts to assign Tenant B's location to Tenant A's group
    const crossTenantLocReq = await createAuthRequest(`/api/governance/groups/${groupId}/locations`, tenantA, 'POST', {
      businessIds: [tenantB.business.id],
    })
    const crossTenantLocRes = await postGroupLocationsHandler(crossTenantLocReq, { params: Promise.resolve({ id: groupId }) })
    assert(crossTenantLocRes.status === 400, 'Cross-tenant location assignment rejected with 400')

    // Tenant A attempts to assign Tenant B's user as an operator in Tenant A
    const crossTenantUserReq = await createAuthRequest('/api/governance/operators', tenantA, 'POST', {
      userId: tenantB.user.id,
      type: 'location',
      targetId: tenantA.business.id,
    })
    const crossTenantUserRes = await postAssignOperatorHandler(crossTenantUserReq)
    assert(crossTenantUserRes.status === 400, 'Tenant A cannot assign Tenant B user (400 CROSS_TENANT_USER)')

    // ------------------------------------------------------------------
    // [Test 8 & 9] Operator Scoping & Location-Level IDOR Protection
    // ------------------------------------------------------------------
    console.log('\n[Test 8 & 9] Operator Location-Level Authorization')
    // Prior to assignment: staffUser has 0 permitted locations
    const unassignedScopeReq = await createAuthRequest('/api/governance/effective-scope', staffTenant, 'GET')
    const unassignedScopeRes = await getEffectiveScopeHandler(unassignedScopeReq)
    const unassignedScopeData = await unassignedScopeRes.json()
    assert(unassignedScopeData.scope.permittedLocationCount === 0, 'Unassigned staff has 0 permitted locations')

    // Create review at Location 1 and Location 2
    const reviewLoc1 = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Downtown Customer',
        rating: 5,
        text: 'Great flagship experience',
        source: ReviewSource.INTERNAL,
        externalId: `rev_flag_${Date.now()}`,
        draftText: 'Thank you from Flagship!',
        draftStatus: DraftStatus.DRAFT,
      },
    })
    const reviewLoc2 = await prisma.review.create({
      data: {
        businessId: tenantALocation2.id,
        author: 'North Branch Customer',
        rating: 4,
        text: 'Good branch coffee',
        source: ReviewSource.INTERNAL,
        externalId: `rev_north_${Date.now()}`,
        draftText: 'Thank you from North Branch!',
        draftStatus: DraftStatus.DRAFT,
      },
    })

    // Assign staffUser specifically to Location 1 ONLY
    const assignOpReq = await createAuthRequest('/api/governance/operators', tenantA, 'POST', {
      userId: staffUser.id,
      type: 'location',
      targetId: tenantA.business.id,
    })
    const assignOpRes = await postAssignOperatorHandler(assignOpReq)
    assert(assignOpRes.status === 201, 'Operator assigned to Location 1 (201 Created)')

    // 8. Operator CANNOT access Location 2 (unauthorized location)
    const staffApproveLoc2Req = await createAuthRequest(`/api/reviews/${reviewLoc2.id}/approve`, staffTenant, 'POST', {
      action: 'approve',
    })
    const staffApproveLoc2Res = await postApproveHandler(staffApproveLoc2Req, { params: Promise.resolve({ id: reviewLoc2.id }) })
    assert(staffApproveLoc2Res.status === 403, 'Operator cannot approve review for unassigned Location 2 (403 FORBIDDEN)')

    // 9. Operator CAN access and approve Location 1 (authorized location)
    const staffApproveLoc1Req = await createAuthRequest(`/api/reviews/${reviewLoc1.id}/approve`, staffTenant, 'POST', {
      action: 'approve',
      manual: true,
    })
    const staffApproveLoc1Res = await postApproveHandler(staffApproveLoc1Req, { params: Promise.resolve({ id: reviewLoc1.id }) })
    assert(staffApproveLoc1Res.status === 200, 'Authorized operator approves review for assigned Location 1 (200 OK)')

    // Verify inbox filtering scopes to assigned location for staff
    const staffInboxReq = await createAuthRequest('/api/inbox', staffTenant, 'GET')
    const staffInboxRes = await getInboxHandler(staffInboxReq)
    const staffInboxData = await staffInboxRes.json()
    const foundNorthReview = staffInboxData.reviews.some((r: any) => r.id === reviewLoc2.id)
    assert(!foundNorthReview, 'Staff inbox excludes reviews from unassigned locations')

    // ------------------------------------------------------------------
    // [Test 16, 17, 18, 19, 20, 21, 22, 23, 24] Bulk Action Safety & Dispatch
    // ------------------------------------------------------------------
    console.log('\n[Section 5] Bulk Action Safety, Authorization & Concurrency')

    // Prepare reviews for bulk testing
    const bulkRev1 = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Bulk Customer 1',
        rating: 5,
        text: 'Bulk review 1',
        source: ReviewSource.INTERNAL,
        externalId: `rev_bulk_1_${Date.now()}`,
        draftText: 'Bulk reply 1',
        draftStatus: DraftStatus.DRAFT,
      },
    })
    const bulkRev2 = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Bulk Customer 2',
        rating: 4,
        text: 'Bulk review 2',
        source: ReviewSource.INTERNAL,
        externalId: `rev_bulk_2_${Date.now()}`,
        draftText: 'Bulk reply 2',
        draftStatus: DraftStatus.DRAFT,
      },
    })
    const tenantBReview = await prisma.review.create({
      data: {
        businessId: tenantB.business.id,
        author: 'Tenant B Customer',
        rating: 5,
        text: 'Tenant B text',
        source: ReviewSource.INTERNAL,
        externalId: `rev_tenant_b_${Date.now()}`,
        draftText: 'Tenant B reply',
        draftStatus: DraftStatus.DRAFT,
      },
    })

    // [Test 16 & 17] Bulk selection containing unauthorized review (Tenant B review included)
    console.log('[Test 16 & 17] Bulk Selection Containing Unauthorized Cross-Tenant Review')
    const mixedBulkReq = await createAuthRequest('/api/reviews/bulk-action', tenantA, 'POST', {
      action: 'approve',
      reviewIds: [bulkRev1.id, tenantBReview.id],
      manual: true,
    })
    const mixedBulkRes = await postBulkActionHandler(mixedBulkReq)
    assert(mixedBulkRes.status === 200, 'Bulk action handles mixed selection gracefully (200)')
    const mixedData = await mixedBulkRes.json()
    assert(mixedData.total === 2, 'Total 2 reviews processed')
    assert(mixedData.authorized === 1, 'Authorized count is 1')
    assert(mixedData.unauthorized === 1, 'Unauthorized count is 1')
    assert(mixedData.savedLocally === 1, 'Authorized review was approved & saved')

    // Verify Tenant B review was NOT mutated or published
    const checkBReview = await prisma.review.findUnique({ where: { id: tenantBReview.id } })
    assert(checkBReview?.draftStatus === DraftStatus.DRAFT, 'Unauthorized review remains unmutated DRAFT')
    assert(checkBReview?.repliedAt === null, 'Unauthorized review was never replied to')

    // [Test 18] Duplicate review IDs handled safely
    console.log('\n[Test 18] Duplicate Review IDs Handled Safely')
    const dupBulkReq = await createAuthRequest('/api/reviews/bulk-action', tenantA, 'POST', {
      action: 'approve',
      reviewIds: [bulkRev2.id, bulkRev2.id, bulkRev2.id],
      manual: true,
    })
    const dupBulkRes = await postBulkActionHandler(dupBulkReq)
    const dupBulkData = await dupBulkRes.json()
    assert(dupBulkData.total === 1, 'Duplicate review IDs deduplicated in batch (total: 1)')
    assert(dupBulkData.savedLocally === 1, 'Deduplicated review processed once')

    // [Test 19] Already-posted review cannot be republished
    console.log('\n[Test 19] Already-Posted Review Cannot Be Republished')
    const reBulkReq = await createAuthRequest('/api/reviews/bulk-action', tenantA, 'POST', {
      action: 'approve',
      reviewIds: [bulkRev2.id],
      manual: true,
    })
    const reBulkRes = await postBulkActionHandler(reBulkReq)
    const reBulkData = await reBulkRes.json()
    assert(reBulkData.skipped === 1, 'Already posted review skipped')
    assert(reBulkData.results[0].code === 'ALREADY_POSTED', 'Result flags code ALREADY_POSTED')

    // [Test 20] Concurrent bulk request cannot double-claim a review
    console.log('\n[Test 20] Concurrency Guard on In-Flight Claim')
    const inFlightReview = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'In Flight Customer',
        rating: 5,
        text: 'In flight review',
        source: ReviewSource.INTERNAL,
        externalId: `rev_flight_${Date.now()}`,
        draftText: 'In flight text',
        draftStatus: DraftStatus.POSTING, // Simulate active in-flight lock
      },
    })
    const conflictBulkReq = await createAuthRequest('/api/reviews/bulk-action', tenantA, 'POST', {
      action: 'approve',
      reviewIds: [inFlightReview.id],
      manual: true,
    })
    const conflictBulkRes = await postBulkActionHandler(conflictBulkReq)
    const conflictBulkData = await conflictBulkRes.json()
    assert(conflictBulkData.skipped === 1, 'In-flight review cannot be double-claimed (skipped: 1)')

    // [Test 21] Successful publish produces truthful success state
    console.log('\n[Test 21] Truthful Success State')
    const freshReview = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Fresh Customer',
        rating: 5,
        text: 'Fresh text',
        source: ReviewSource.INTERNAL,
        externalId: `rev_fresh_${Date.now()}`,
        draftText: 'Fresh reply',
        draftStatus: DraftStatus.PENDING,
      },
    })
    const freshBulkReq = await createAuthRequest('/api/reviews/bulk-action', tenantA, 'POST', {
      action: 'approve',
      reviewIds: [freshReview.id],
      manual: true,
    })
    const freshBulkRes = await postBulkActionHandler(freshBulkReq)
    const freshData = await freshBulkRes.json()
    assert(freshData.savedLocally === 1, 'Fresh review marked savedLocally: 1')
    assert(freshData.results[0].publishStatus === 'SAVED_LOCALLY', 'publishStatus is truthful SAVED_LOCALLY')

    // [Test 22] Failed publish produces truthful failure state
    console.log('\n[Test 22] Truthful Failure State (Unconnected Google)')
    const googleReview = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Google Customer',
        rating: 4,
        text: 'Google review text',
        source: ReviewSource.GOOGLE,
        externalId: `rev_goog_fail_${Date.now()}`,
        draftText: 'Google draft reply',
        draftStatus: DraftStatus.PENDING,
      },
    })
    const googleBulkReq = await createAuthRequest('/api/reviews/bulk-action', tenantA, 'POST', {
      action: 'publish',
      reviewIds: [googleReview.id],
      publishMode: 'platform',
    })
    const googleBulkRes = await postBulkActionHandler(googleBulkReq)
    const googleData = await googleBulkRes.json()
    assert(googleData.failed === 1, 'Google bulk publish without token reports failed: 1')
    assert(googleData.results[0].publishStatus === 'FAILED', 'publishStatus is FAILED')
    assert(googleData.results[0].code === 'NO_OAUTH_TOKEN', 'code is NO_OAUTH_TOKEN')
    assert(googleData.results[0].publishedLive === false, 'publishedLive is strictly false')

    // Verify DB rollback to APPROVED
    const checkGoogleDb = await prisma.review.findUnique({ where: { id: googleReview.id } })
    assert(checkGoogleDb?.draftStatus === DraftStatus.APPROVED, 'Failed review safely rolled back to APPROVED')

    // [Test 23] Ambiguous / network publish produces UNCONFIRMED state
    console.log('\n[Test 23] Ambiguous Network Publish Produces UNCONFIRMED State')
    // Connect a mock Facebook token that triggers timeout
    const fbBusiness = await prisma.business.create({
      data: {
        orgId: tenantA.org.id,
        ownerId: tenantA.user.id,
        name: 'FB Test Business',
        facebookPageId: 'page_timeout_test',
      },
    })
    await prisma.oAuthToken.create({
      data: {
        businessId: fbBusiness.id,
        provider: 'facebook',
        accessTokenEnc: encrypt('mock_fb_access_token'),
        refreshTokenEnc: encrypt('mock_fb_refresh_token'),
      },
    })
    const fbTimeoutReview = await prisma.review.create({
      data: {
        businessId: fbBusiness.id,
        author: 'FB Timeout Customer',
        rating: 5,
        text: 'FB Timeout text',
        source: ReviewSource.FACEBOOK,
        externalId: 'open_graph_story_fb_timeout_1', // Triggers mock timeout
        draftText: 'FB Timeout reply',
        draftStatus: DraftStatus.PENDING,
      },
    })

    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('graph.facebook.com') && url.includes('/comments')) {
        throw new Error('ETIMEDOUT: Connection socket closed unexpectedly after dispatch')
      }
      return originalFetch(input, init)
    }) as typeof fetch

    try {
      const fbBulkReq = await createAuthRequest('/api/reviews/bulk-action', tenantA, 'POST', {
        action: 'publish',
        reviewIds: [fbTimeoutReview.id],
        publishMode: 'platform',
      })
      const fbBulkRes = await postBulkActionHandler(fbBulkReq)
      const fbData = await fbBulkRes.json()
      assert(fbData.unconfirmed === 1, 'Network timeout reports unconfirmed: 1')
      assert(fbData.results[0].publishStatus === 'UNCONFIRMED', 'publishStatus is UNCONFIRMED')
      assert(fbData.results[0].code === 'AMBIGUOUS_PUBLISH', 'code is AMBIGUOUS_PUBLISH')
    } finally {
      globalThis.fetch = originalFetch
    }

    // [Test 24] Publish Attempt Records Created
    console.log('\n[Test 24] Publish Attempt Records Created')
    const attempts = await prisma.reviewPublishAttempt.findMany({
      where: { reviewId: fbTimeoutReview.id },
    })
    assert(attempts.length > 0, 'Publish attempt record persisted')
    assert(attempts[0].status === PublishAttemptStatus.UNCONFIRMED, 'Attempt status recorded as UNCONFIRMED')

    // [Test 25] Audit Logs Created
    console.log('\n[Test 25] Audit Logs Created')
    const hasGroupCreated = await prisma.auditLog.findFirst({ where: { actorId: tenantA.user.id, action: 'governance.group_created' } })
    assert(hasGroupCreated !== null, 'Captured governance.group_created audit')
    const hasGroupLocs = await prisma.auditLog.findFirst({ where: { actorId: tenantA.user.id, action: 'governance.group_locations_assigned' } })
    assert(hasGroupLocs !== null, 'Captured governance.group_locations_assigned audit')
    const hasOpAssigned = await prisma.auditLog.findFirst({ where: { actorId: tenantA.user.id, action: 'governance.operator_assigned' } })
    assert(hasOpAssigned !== null, 'Captured governance.operator_assigned audit')
    const hasBulkInit = await prisma.auditLog.findFirst({ where: { actorId: tenantA.user.id, action: 'reply.bulk_action_initiated' } })
    assert(hasBulkInit !== null, 'Captured reply.bulk_action_initiated audit')
    const hasBulkUnauth = await prisma.auditLog.findFirst({ where: { actorId: tenantA.user.id, action: 'reply.bulk_unauthorized_attempt' } })
    assert(hasBulkUnauth !== null, 'Captured reply.bulk_unauthorized_attempt audit')

    // [Test 12] Group Deletion
    console.log('\n[Test 12] Group Deletion')
    const deleteGroupReq = await createAuthRequest(`/api/governance/groups/${groupId}`, tenantA, 'DELETE')
    const deleteGroupRes = await deleteGroupHandler(deleteGroupReq, { params: Promise.resolve({ id: groupId }) })
    assert(deleteGroupRes.status === 200, 'Group deleted successfully (200)')

    const verifyDeletedGroup = await prisma.locationGroup.findUnique({ where: { id: groupId } })
    assert(verifyDeletedGroup === null, 'Group removed from database')

    // [Test 26] Organization Isolation Preserved
    console.log('\n[Test 26] Organization Isolation Preserved')
    const tenantBGroups = await prisma.locationGroup.findMany({ where: { orgId: tenantB.org.id } })
    assert(tenantBGroups.length === 0, 'Tenant B organization has 0 groups (zero leakage)')

    // [Test 27] Existing JOB-12 Publishing Intact
    console.log('\n[Test 27] Existing JOB-12 Single-Review Publishing Intact')
    const singleRev = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Single Customer',
        rating: 5,
        text: 'Single review text',
        source: ReviewSource.INTERNAL,
        externalId: `rev_single_${Date.now()}`,
        draftText: 'Single reply text',
        draftStatus: DraftStatus.DRAFT,
      },
    })
    const singleApproveReq = await createAuthRequest(`/api/reviews/${singleRev.id}/approve`, tenantA, 'POST', {
      action: 'approve',
      manual: true,
    })
    const singleApproveRes = await postApproveHandler(singleApproveReq, { params: Promise.resolve({ id: singleRev.id }) })
    assert(singleApproveRes.status === 200, 'Single approve route functions identically (200)')
    const singleData = await singleApproveRes.json()
    assert(singleData.publishStatus === 'SAVED_LOCALLY', 'Single review publishStatus is SAVED_LOCALLY')

    // [Test 28] True Simultaneous Concurrency Race (Promise.all dispatch on same review X)
    console.log('\n[Test 28] True Simultaneous Concurrency Race (simultaneous dispatch on same review X)')
    const concurrentRev = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Race Customer',
        rating: 5,
        text: 'Race condition test review',
        source: ReviewSource.INTERNAL,
        externalId: `rev_race_${Date.now()}`,
        draftText: 'Simultaneous reply test',
        draftStatus: DraftStatus.DRAFT,
      },
    })

    const raceReq1 = await createAuthRequest('/api/reviews/bulk-action', tenantA, 'POST', {
      action: 'approve',
      reviewIds: [concurrentRev.id],
      manual: true,
    })
    const raceReq2 = await createAuthRequest('/api/reviews/bulk-action', tenantA, 'POST', {
      action: 'approve',
      reviewIds: [concurrentRev.id],
      manual: true,
    })

    const [raceRes1, raceRes2] = await Promise.all([
      postBulkActionHandler(raceReq1),
      postBulkActionHandler(raceReq2),
    ])

    const raceData1 = await raceRes1.json()
    const raceData2 = await raceRes2.json()

    const savedTotal = raceData1.savedLocally + raceData2.savedLocally
    const skippedTotal = raceData1.skipped + raceData2.skipped
    assert(savedTotal === 1, 'Exactly one concurrent request successfully claims and saves the review')
    assert(skippedTotal === 1, 'The losing concurrent request is safely skipped (concurrency locked)')

    const loserResult = raceData1.skipped === 1 ? raceData1.results[0] : raceData2.results[0]
    assert(
      loserResult.code === 'CONCURRENCY_LOCKED' || loserResult.code === 'ALREADY_POSTING' || loserResult.code === 'ALREADY_POSTED',
      'Losing request received concurrency lock/already-posted code'
    )

    // [Test 29] Operator Scope Combinations (Operator A, B, C UNION)
    console.log('\n[Test 29] Operator Scope Combinations (Operator A, B, C UNION)')
    // Seed additional businesses for Operator testing
    const loc4 = await prisma.business.create({
      data: { orgId: tenantA.org.id, ownerId: tenantA.user.id, name: 'Location 4', address: '400 Ave' },
    })
    const loc5 = await prisma.business.create({
      data: { orgId: tenantA.org.id, ownerId: tenantA.user.id, name: 'Location 5', address: '500 Ave' },
    })

    // Create Group A with Locations 1, 2, 3
    const groupA = await prisma.locationGroup.create({
      data: {
        orgId: tenantA.org.id,
        name: `Group A ${Date.now()}`,
        locations: {
          create: [
            { businessId: tenantA.business.id },
            { businessId: tenantALocation2.id },
            { businessId: tenantALocation3.id },
          ],
        },
      },
    })

    // Create Group B with Locations 4, 5
    const groupB = await prisma.locationGroup.create({
      data: {
        orgId: tenantA.org.id,
        name: `Group B ${Date.now()}`,
        locations: {
          create: [
            { businessId: loc4.id },
            { businessId: loc5.id },
          ],
        },
      },
    })

    // Create Operators A, B, C
    const userA = await prisma.user.create({ data: { email: `opA_${Date.now()}@example.com`, name: 'Operator A' } })
    const userB = await prisma.user.create({ data: { email: `opB_${Date.now()}@example.com`, name: 'Operator B' } })
    const userC = await prisma.user.create({ data: { email: `opC_${Date.now()}@example.com`, name: 'Operator C' } })

    await prisma.orgMember.createMany({
      data: [
        { orgId: tenantA.org.id, userId: userA.id, role: Role.STAFF },
        { orgId: tenantA.org.id, userId: userB.id, role: Role.STAFF },
        { orgId: tenantA.org.id, userId: userC.id, role: Role.STAFF },
      ],
    })

    // Operator A: Location 1 only
    await prisma.operatorLocationAssignment.create({
      data: { orgId: tenantA.org.id, userId: userA.id, businessId: tenantA.business.id },
    })

    // Operator B: Group A (Locations 1, 2, 3)
    await prisma.operatorGroupAssignment.create({
      data: { orgId: tenantA.org.id, userId: userB.id, groupId: groupA.id },
    })

    // Operator C: Location 1 + Group B (Locations 4, 5)
    await prisma.operatorLocationAssignment.create({
      data: { orgId: tenantA.org.id, userId: userC.id, businessId: tenantA.business.id },
    })
    await prisma.operatorGroupAssignment.create({
      data: { orgId: tenantA.org.id, userId: userC.id, groupId: groupB.id },
    })

    const scopeA = await resolveEffectiveScope(userA.id, tenantA.org.id, Role.STAFF)
    const scopeB = await resolveEffectiveScope(userB.id, tenantA.org.id, Role.STAFF)
    const scopeC = await resolveEffectiveScope(userC.id, tenantA.org.id, Role.STAFF)

    assert(scopeA.permittedBusinessIds.length === 1 && scopeA.permittedBusinessIds.includes(tenantA.business.id), 'Operator A effective scope is Location 1 only')
    assert(scopeB.permittedBusinessIds.length === 3 && [tenantA.business.id, tenantALocation2.id, tenantALocation3.id].every(id => scopeB.permittedBusinessIds.includes(id)), 'Operator B effective scope is Group A (Locations 1, 2, 3)')
    assert(scopeC.permittedBusinessIds.length === 3 && [tenantA.business.id, loc4.id, loc5.id].every(id => scopeC.permittedBusinessIds.includes(id)), 'Operator C effective scope is Location 1 + Group B (Locations 4, 5) UNION')

    // Dynamic membership change: Remove Location 5 from Group B
    await prisma.locationGroupMembership.deleteMany({
      where: { groupId: groupB.id, businessId: loc5.id },
    })
    const scopeCUpdated = await resolveEffectiveScope(userC.id, tenantA.org.id, Role.STAFF)
    assert(scopeCUpdated.permittedBusinessIds.length === 2 && !scopeCUpdated.permittedBusinessIds.includes(loc5.id), 'Removing Location 5 from Group B immediately updates Operator C scope (dynamic calculation)')

    // [Test 30] Duplicate IDs in Group Location Assignment
    console.log('\n[Test 30] Duplicate Location IDs Handled Safely in Group Assignment')
    const dupLocReq = await createAuthRequest(`/api/governance/groups/${groupA.id}/locations`, tenantA, 'POST', {
      businessIds: [loc4.id, loc4.id, loc5.id, loc5.id],
    })
    const dupLocRes = await postGroupLocationsHandler(dupLocReq, { params: Promise.resolve({ id: groupA.id }) })
    assert(dupLocRes.status === 200, 'Duplicate location IDs in request succeed idempotently without error')

    // [Test 31] Missing Draft Text Handling
    console.log('\n[Test 31] Missing Draft Text Skipped Safely')
    const noTextRev = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'No Text Customer',
        rating: 4,
        text: 'Review text',
        source: ReviewSource.INTERNAL,
        externalId: `rev_notext_${Date.now()}`,
        draftText: '',
        draftStatus: DraftStatus.PENDING,
      },
    })
    const noTextReq = await createAuthRequest('/api/reviews/bulk-action', tenantA, 'POST', {
      action: 'approve',
      reviewIds: [noTextRev.id],
      manual: true,
    })
    const noTextRes = await postBulkActionHandler(noTextReq)
    const noTextData = await noTextRes.json()
    assert(noTextData.skipped === 1, 'Review without draft text is skipped (skipped: 1)')
    assert(noTextData.results[0].code === 'NO_DRAFT_TEXT', 'Result reports code NO_DRAFT_TEXT')

    // [Test 32] Reject Protection on Posted Review
    console.log('\n[Test 32] Reject Protection on Posted Review')
    const postedRev = await prisma.review.create({
      data: {
        businessId: tenantA.business.id,
        author: 'Already Posted Customer',
        rating: 5,
        text: 'Already posted text',
        source: ReviewSource.INTERNAL,
        externalId: `rev_posted_reject_${Date.now()}`,
        draftText: 'Already posted reply',
        replyText: 'Already posted reply',
        draftStatus: DraftStatus.POSTED,
      },
    })
    const rejectBulkReq = await createAuthRequest('/api/reviews/bulk-action', tenantA, 'POST', {
      action: 'reject',
      reviewIds: [postedRev.id],
    })
    const rejectBulkRes = await postBulkActionHandler(rejectBulkReq)
    const rejectBulkData = await rejectBulkRes.json()
    assert(rejectBulkData.skipped === 1, 'Bulk reject skips already posted review')
    assert(rejectBulkData.results[0].code === 'ALREADY_POSTED', 'Bulk reject reports ALREADY_POSTED')

    const rejectSingleReq = await createAuthRequest(`/api/reviews/${postedRev.id}/approve`, tenantA, 'POST', {
      action: 'reject',
    })
    const rejectSingleRes = await postApproveHandler(rejectSingleReq, { params: Promise.resolve({ id: postedRev.id }) })
    assert(rejectSingleRes.status === 400, 'Single reject on posted review returns 400')

    // [Test 33] Google Live API Dispatch Success Simulation
    console.log('\n[Test 33] Google Live API Dispatch Success Simulation')
    const gbpLiveBiz = await prisma.business.create({
      data: {
        orgId: tenantA.org.id,
        ownerId: tenantA.user.id,
        name: 'GBP Live Business',
        googleLocationId: 'accounts/123/locations/456',
      },
    })
    await prisma.oAuthToken.create({
      data: {
        businessId: gbpLiveBiz.id,
        provider: 'google',
        accessTokenEnc: encrypt('mock_valid_gbp_access_token'),
        refreshTokenEnc: encrypt('mock_gbp_refresh_token'),
        expiresAt: new Date(Date.now() + 3600 * 1000), // Valid for 1h
      },
    })
    const gbpLiveRev = await prisma.review.create({
      data: {
        businessId: gbpLiveBiz.id,
        author: 'GBP Live Customer',
        rating: 5,
        text: 'Live GBP review',
        source: ReviewSource.GOOGLE,
        externalId: `gbp_live_rev_${Date.now()}`,
        draftText: 'Thank you for your visit!',
        draftStatus: DraftStatus.PENDING,
      },
    })

    const origFetch33 = globalThis.fetch
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('mybusiness.googleapis.com') && url.includes('/reply')) {
        return new Response(JSON.stringify({ comment: 'Thank you for your visit!' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return origFetch33(input, init)
    }) as typeof fetch

    try {
      const gbpLiveReq = await createAuthRequest('/api/reviews/bulk-action', tenantA, 'POST', {
        action: 'publish',
        reviewIds: [gbpLiveRev.id],
        publishMode: 'platform',
      })
      const gbpLiveRes = await postBulkActionHandler(gbpLiveReq)
      const gbpLiveData = await gbpLiveRes.json()
      assert(gbpLiveData.published === 1, 'Google review published live: 1')
      assert(gbpLiveData.results[0].publishStatus === 'LIVE', 'publishStatus is LIVE')
      assert(gbpLiveData.results[0].publishedLive === true, 'publishedLive is true')

      const gbpDb = await prisma.review.findUnique({ where: { id: gbpLiveRev.id } })
      assert(gbpDb?.draftStatus === DraftStatus.POSTED, 'Google review draftStatus updated to POSTED')
      assert(gbpDb?.replyText === 'Thank you for your visit!', 'Google review replyText saved')
      assert(gbpDb?.repliedAt !== null, 'Google review repliedAt populated')
      assert(gbpDb?.repliedBy === tenantA.user.id, 'Google review repliedBy populated with actor')

      const gbpAttempt = await prisma.reviewPublishAttempt.findFirst({
        where: { reviewId: gbpLiveRev.id },
        orderBy: { createdAt: 'desc' },
      })
      assert(gbpAttempt?.status === PublishAttemptStatus.SUCCESS, 'Google publish attempt status is SUCCESS')
    } finally {
      globalThis.fetch = origFetch33
    }

    // [Test 34] Facebook Live API Dispatch Success Simulation
    console.log('\n[Test 34] Facebook Live API Dispatch Success Simulation')
    const fbLiveRev = await prisma.review.create({
      data: {
        businessId: fbBusiness.id,
        author: 'FB Live Customer',
        rating: 5,
        text: 'Live FB review',
        source: ReviewSource.FACEBOOK,
        externalId: `open_graph_story_live_${Date.now()}`,
        draftText: 'Thank you from Facebook!',
        draftStatus: DraftStatus.PENDING,
      },
    })

    const origFetch34 = globalThis.fetch
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('graph.facebook.com') && url.includes('/comments')) {
        return new Response(JSON.stringify({ id: 'fb_comment_live_12345' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return origFetch34(input, init)
    }) as typeof fetch

    try {
      const fbLiveReq = await createAuthRequest('/api/reviews/bulk-action', tenantA, 'POST', {
        action: 'publish',
        reviewIds: [fbLiveRev.id],
        publishMode: 'platform',
      })
      const fbLiveRes = await postBulkActionHandler(fbLiveReq)
      const fbLiveData = await fbLiveRes.json()
      assert(fbLiveData.published === 1, 'Facebook review published live: 1')
      assert(fbLiveData.results[0].publishStatus === 'LIVE', 'Facebook publishStatus is LIVE')
      assert(fbLiveData.results[0].publishedLive === true, 'Facebook publishedLive is true')

      const fbDb = await prisma.review.findUnique({ where: { id: fbLiveRev.id } })
      assert(fbDb?.draftStatus === DraftStatus.POSTED, 'Facebook review draftStatus updated to POSTED')
      assert(fbDb?.replyText === 'Thank you from Facebook!', 'Facebook review replyText saved')
      assert(fbDb?.repliedAt !== null, 'Facebook review repliedAt populated')
      assert(fbDb?.repliedBy === tenantA.user.id, 'Facebook review repliedBy populated with actor')

      const fbAttempt = await prisma.reviewPublishAttempt.findFirst({
        where: { reviewId: fbLiveRev.id },
        orderBy: { createdAt: 'desc' },
      })
      assert(fbAttempt?.status === PublishAttemptStatus.SUCCESS, 'Facebook publish attempt status is SUCCESS')
      assert(fbAttempt?.remoteId === 'fb_comment_live_12345', 'Facebook publish attempt remoteId captured')
    } finally {
      globalThis.fetch = origFetch34
    }

    // [Test 35] Facebook Definitive 401 Auth Failure
    console.log('\n[Test 35] Facebook Definitive 401 Auth Failure (reports FAILED, not UNCONFIRMED)')
    const fbAuthFailRev = await prisma.review.create({
      data: {
        businessId: fbBusiness.id,
        author: 'FB Auth Fail Customer',
        rating: 4,
        text: 'Auth fail review',
        source: ReviewSource.FACEBOOK,
        externalId: `open_graph_story_authfail_${Date.now()}`,
        draftText: 'Auth fail reply',
        draftStatus: DraftStatus.PENDING,
      },
    })

    const origFetch35 = globalThis.fetch
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes('graph.facebook.com') && url.includes('/comments')) {
        return new Response(JSON.stringify({ error: { message: 'Session has expired or was revoked', code: 190 } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
      }
      return origFetch35(input, init)
    }) as typeof fetch

    try {
      const fbAuthReq = await createAuthRequest('/api/reviews/bulk-action', tenantA, 'POST', {
        action: 'publish',
        reviewIds: [fbAuthFailRev.id],
        publishMode: 'platform',
      })
      const fbAuthRes = await postBulkActionHandler(fbAuthReq)
      const fbAuthData = await fbAuthRes.json()
      assert(fbAuthData.failed === 1, 'Facebook 401 reports failed: 1')
      assert(fbAuthData.unconfirmed === 0, 'Facebook 401 is NOT counted as unconfirmed')
      assert(fbAuthData.results[0].publishStatus === 'FAILED', 'publishStatus is FAILED')
      assert(fbAuthData.results[0].code === 'FACEBOOK_AUTH_ERROR', 'code is FACEBOOK_AUTH_ERROR')

      const fbAuthAttempt = await prisma.reviewPublishAttempt.findFirst({
        where: { reviewId: fbAuthFailRev.id },
        orderBy: { createdAt: 'desc' },
      })
      assert(fbAuthAttempt?.status === PublishAttemptStatus.FAILED, 'PublishAttempt status is FAILED')
    } finally {
      globalThis.fetch = origFetch35
    }

    // [Test 36] Operator Listing Endpoint
    console.log('\n[Test 36] Operator Listing Endpoint (GET /api/governance/operators)')
    const getOpsReq = await createAuthRequest('/api/governance/operators', tenantA, 'GET')
    const getOpsRes = await getOperatorsHandler(getOpsReq)
    assert(getOpsRes.status === 200, 'Admin can list operators (200 OK)')
    const opsData = await getOpsRes.json()
    assert(Array.isArray(opsData.operators), 'Returns operators array')
    assert(opsData.operators.length >= 4, 'Includes org members')
    const foundOpA = opsData.operators.find((o: any) => o.userId === userA.id)
    assert(foundOpA !== undefined, 'Operator A present in operator listing')
    assert(foundOpA?.assignedLocations.length === 1, 'Operator A assignedLocations list accurate')
  } catch (error) {
    console.error('Test suite runtime error:', error)
    failed++
  } finally {
    console.log('\nCleaning up test tenants...')
    if (tenantA) await cleanupTestTenant(tenantA.org.id)
    if (tenantB) await cleanupTestTenant(tenantB.org.id)
    await prisma.$disconnect()
  }

  console.log('====================================================================')
  console.log(`JOB-14 VERIFICATION SUMMARY: ${passed} passed / ${failed} failed`)
  console.log('====================================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

run()
