import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'
import { isOrgAdminRole } from '@/lib/operator-governance'

export const dynamic = 'force-dynamic'

// GET /api/governance/operators — List all operators in the organization with their scope
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    // 1. Fetch all members of this organization
    const members = await db.orgMember.findMany({
      where: { orgId: ctx.orgId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    // 2. Fetch all direct location assignments in this org
    const locationAssignments = await db.operatorLocationAssignment.findMany({
      where: { orgId: ctx.orgId },
      include: {
        business: {
          select: { id: true, name: true },
        },
      },
    })

    // 3. Fetch all group assignments in this org
    const groupAssignments = await db.operatorGroupAssignment.findMany({
      where: { orgId: ctx.orgId },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            locations: {
              select: { businessId: true },
            },
          },
        },
      },
    })

    // Map data per user
    const operators = members.map((m) => {
      const uId = m.userId
      const isUserAdmin = isOrgAdminRole(m.role)

      const userLocs = locationAssignments
        .filter((a) => a.userId === uId)
        .map((a) => a.business)

      const userGroups = groupAssignments
        .filter((a) => a.userId === uId)
        .map((a) => ({
          id: a.group.id,
          name: a.group.name,
          locationCount: a.group.locations.length,
          locationIds: a.group.locations.map((l) => l.businessId),
        }))

      // Effective locations set
      const effectiveLocationIds = new Set<string>()
      if (isUserAdmin) {
        ctx.allOrgBusinessIds.forEach((id) => effectiveLocationIds.add(id))
      } else {
        userLocs.forEach((l) => effectiveLocationIds.add(l.id))
        userGroups.forEach((g) => g.locationIds.forEach((id) => effectiveLocationIds.add(id)))
      }

      return {
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        isOrgAdmin: isUserAdmin,
        assignedLocations: userLocs,
        assignedGroups: userGroups.map((g) => ({ id: g.id, name: g.name, locationCount: g.locationCount })),
        effectiveLocationCount: effectiveLocationIds.size,
        effectiveLocationIds: Array.from(effectiveLocationIds),
      }
    })

    return NextResponse.json({ operators })
  } catch (error) {
    console.error('Failed to list operators:', error)
    return NextResponse.json({ error: 'Failed to list operators' }, { status: 500 })
  }
}

// POST /api/governance/operators — Assign operator to location or group
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  if (!isOrgAdminRole(ctx.user.role)) {
    return NextResponse.json(
      { error: 'Only organization administrators may assign operators', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  try {
    const body = await request.json().catch(() => ({}))
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
    const type = body.type as 'location' | 'group' | undefined
    const targetId = typeof body.targetId === 'string' ? body.targetId.trim() : ''

    if (!userId || !type || !targetId) {
      return NextResponse.json(
        { error: 'userId, type (location | group), and targetId are required', code: 'INVALID_INPUT' },
        { status: 400 }
      )
    }

    if (type !== 'location' && type !== 'group') {
      return NextResponse.json({ error: 'type must be location or group', code: 'INVALID_TYPE' }, { status: 400 })
    }

    // Anti-IDOR 1: Verify user is a member of this organization
    const member = await db.orgMember.findUnique({
      where: {
        orgId_userId: {
          orgId: ctx.orgId,
          userId,
        },
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    })

    if (!member) {
      return NextResponse.json(
        { error: 'User does not belong to this organization', code: 'CROSS_TENANT_USER' },
        { status: 400 }
      )
    }

    if (type === 'location') {
      // Anti-IDOR 2: Verify business belongs to this organization
      if (!ctx.allOrgBusinessIds.includes(targetId)) {
        return NextResponse.json(
          { error: 'Location does not belong to this organization', code: 'CROSS_TENANT_LOCATION' },
          { status: 400 }
        )
      }

      // Safe idempotent upsert
      const assignment = await db.operatorLocationAssignment.upsert({
        where: {
          userId_businessId: {
            userId,
            businessId: targetId,
          },
        },
        create: {
          orgId: ctx.orgId,
          userId,
          businessId: targetId,
          assignedById: ctx.user.id,
        },
        update: {},
      })

      await db.auditLog.create({
        data: {
          actorId: ctx.user.id,
          action: 'governance.operator_assigned',
          targetType: 'business',
          targetId,
          metadata: JSON.stringify({
            userId,
            type: 'location',
            businessId: targetId,
            assignmentId: assignment.id,
          }),
        },
      })

      return NextResponse.json({ success: true, assignment }, { status: 201 })
    }

    if (type === 'group') {
      // Anti-IDOR 2: Verify group belongs to this organization (DB-scoped)
      const group = await db.locationGroup.findFirst({
        where: { id: targetId, orgId: ctx.orgId },
      })

      if (!group) {
        return NextResponse.json(
          { error: 'Location group does not belong to this organization', code: 'CROSS_TENANT_GROUP' },
          { status: 400 }
        )
      }

      // Safe idempotent upsert
      const assignment = await db.operatorGroupAssignment.upsert({
        where: {
          userId_groupId: {
            userId,
            groupId: targetId,
          },
        },
        create: {
          orgId: ctx.orgId,
          userId,
          groupId: targetId,
          assignedById: ctx.user.id,
        },
        update: {},
      })

      await db.auditLog.create({
        data: {
          actorId: ctx.user.id,
          action: 'governance.operator_assigned',
          targetType: 'location_group',
          targetId,
          metadata: JSON.stringify({
            userId,
            type: 'group',
            groupId: targetId,
            assignmentId: assignment.id,
          }),
        },
      })

      return NextResponse.json({ success: true, assignment }, { status: 201 })
    }

    return NextResponse.json({ error: 'Invalid assignment type' }, { status: 400 })
  } catch (error) {
    console.error('Failed to assign operator:', error)
    return NextResponse.json({ error: 'Failed to assign operator' }, { status: 500 })
  }
}

// DELETE /api/governance/operators — Remove operator assignment
export async function DELETE(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  if (!isOrgAdminRole(ctx.user.role)) {
    return NextResponse.json(
      { error: 'Only organization administrators may remove operator assignments', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  try {
    const body = await request.json().catch(() => ({}))
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
    const type = body.type as 'location' | 'group' | undefined
    const targetId = typeof body.targetId === 'string' ? body.targetId.trim() : ''

    if (!userId || !type || !targetId) {
      return NextResponse.json(
        { error: 'userId, type (location | group), and targetId are required', code: 'INVALID_INPUT' },
        { status: 400 }
      )
    }

    // Verify user belongs to this org
    const member = await db.orgMember.findUnique({
      where: {
        orgId_userId: {
          orgId: ctx.orgId,
          userId,
        },
      },
    })
    if (!member) {
      return NextResponse.json({ error: 'User does not belong to this organization', code: 'NOT_FOUND' }, { status: 404 })
    }

    if (type === 'location') {
      await db.operatorLocationAssignment.deleteMany({
        where: {
          orgId: ctx.orgId,
          userId,
          businessId: targetId,
        },
      })

      await db.auditLog.create({
        data: {
          actorId: ctx.user.id,
          action: 'governance.operator_removed',
          targetType: 'business',
          targetId,
          metadata: JSON.stringify({ userId, type: 'location', businessId: targetId }),
        },
      })

      return NextResponse.json({ success: true, message: 'Location assignment removed' })
    }

    if (type === 'group') {
      await db.operatorGroupAssignment.deleteMany({
        where: {
          orgId: ctx.orgId,
          userId,
          groupId: targetId,
        },
      })

      await db.auditLog.create({
        data: {
          actorId: ctx.user.id,
          action: 'governance.operator_removed',
          targetType: 'location_group',
          targetId,
          metadata: JSON.stringify({ userId, type: 'group', groupId: targetId }),
        },
      })

      return NextResponse.json({ success: true, message: 'Group assignment removed' })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  } catch (error) {
    console.error('Failed to remove operator assignment:', error)
    return NextResponse.json({ error: 'Failed to remove operator assignment' }, { status: 500 })
  }
}
