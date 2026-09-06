import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'
import { isOrgAdminRole } from '@/lib/operator-governance'

export const dynamic = 'force-dynamic'

// POST /api/governance/groups/[id]/locations — Assign locations to group
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  if (!isOrgAdminRole(ctx.user.role)) {
    return NextResponse.json(
      { error: 'Only organization administrators may assign locations to groups', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  try {
    const { id: groupId } = await params
    const body = await request.json().catch(() => ({}))
    const rawBusinessIds = Array.isArray(body.businessIds)
      ? (body.businessIds as string[])
      : body.businessId
      ? [body.businessId as string]
      : []

    // Deduplicate and sanitize IDs
    const businessIds = Array.from(
      new Set(rawBusinessIds.map((b) => (typeof b === 'string' ? b.trim() : '')).filter(Boolean))
    )

    if (businessIds.length === 0) {
      return NextResponse.json({ error: 'businessIds array is required', code: 'INVALID_INPUT' }, { status: 400 })
    }

    // Verify group belongs to caller's org (DB-scoped)
    const group = await db.locationGroup.findFirst({
      where: { id: groupId, orgId: ctx.orgId },
    })
    if (!group) {
      return NextResponse.json({ error: 'Location group not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    // Anti-IDOR: verify every location belongs to caller's org
    for (const bId of businessIds) {
      if (!ctx.allOrgBusinessIds.includes(bId)) {
        return NextResponse.json(
          { error: `Location ${bId} does not belong to your organization`, code: 'CROSS_TENANT_LOCATION' },
          { status: 400 }
        )
      }
    }

    // Idempotent assignment: ignore already existing memberships
    const existingMemberships = await db.locationGroupMembership.findMany({
      where: {
        groupId,
        businessId: { in: businessIds },
      },
      select: { businessId: true },
    })
    const existingSet = new Set(existingMemberships.map((m) => m.businessId))
    const newBusinessIds = businessIds.filter((bId) => !existingSet.has(bId))

    if (newBusinessIds.length > 0) {
      await db.locationGroupMembership.createMany({
        data: newBusinessIds.map((bId) => ({
          groupId,
          businessId: bId,
        })),
        skipDuplicates: true,
      })
    }

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'governance.group_locations_assigned',
        targetType: 'location_group',
        targetId: groupId,
        metadata: JSON.stringify({
          groupId,
          assignedCount: newBusinessIds.length,
          businessIds,
        }),
      },
    })

    return NextResponse.json({
      success: true,
      assignedCount: newBusinessIds.length,
      totalCount: existingMemberships.length + newBusinessIds.length,
    })
  } catch (error) {
    console.error('Failed to assign locations to group:', error)
    return NextResponse.json({ error: 'Failed to assign locations to group' }, { status: 500 })
  }
}

// DELETE /api/governance/groups/[id]/locations — Remove a location from group
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  if (!isOrgAdminRole(ctx.user.role)) {
    return NextResponse.json(
      { error: 'Only organization administrators may remove locations from groups', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  try {
    const { id: groupId } = await params
    const { searchParams } = new URL(request.url)
    const body = await request.json().catch(() => ({}))
    const businessId = (searchParams.get('businessId') || body.businessId) as string | undefined

    if (!businessId) {
      return NextResponse.json({ error: 'businessId is required', code: 'INVALID_INPUT' }, { status: 400 })
    }

    // Verify group belongs to caller's org (DB-scoped)
    const group = await db.locationGroup.findFirst({
      where: { id: groupId, orgId: ctx.orgId },
    })
    if (!group) {
      return NextResponse.json({ error: 'Location group not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    // Anti-IDOR: verify location belongs to caller's org
    if (!ctx.allOrgBusinessIds.includes(businessId)) {
      return NextResponse.json(
        { error: 'Location does not belong to your organization', code: 'CROSS_TENANT_LOCATION' },
        { status: 400 }
      )
    }

    await db.locationGroupMembership.deleteMany({
      where: {
        groupId,
        businessId,
      },
    })

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'governance.group_location_removed',
        targetType: 'location_group',
        targetId: groupId,
        metadata: JSON.stringify({
          groupId,
          removedBusinessId: businessId,
        }),
      },
    })

    return NextResponse.json({ success: true, message: 'Location removed from group' })
  } catch (error) {
    console.error('Failed to remove location from group:', error)
    return NextResponse.json({ error: 'Failed to remove location from group' }, { status: 500 })
  }
}
