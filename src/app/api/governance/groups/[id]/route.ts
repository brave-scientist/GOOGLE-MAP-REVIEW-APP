import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'
import { isOrgAdminRole } from '@/lib/operator-governance'

export const dynamic = 'force-dynamic'

// GET /api/governance/groups/[id] — Retrieve group details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const { id } = await params

    const group = await db.locationGroup.findFirst({
      where: { id, orgId: ctx.orgId },
      include: {
        locations: {
          include: {
            business: {
              select: { id: true, name: true, address: true, industry: true, avgRating: true, reviewCount: true },
            },
          },
        },
        operatorAssignments: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    })

    // Strict tenant boundary check: fail closed if group not in caller's org
    if (!group) {
      return NextResponse.json({ error: 'Location group not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
        locationCount: group.locations.length,
        locations: group.locations.map((l) => l.business),
        operatorCount: group.operatorAssignments.length,
        operators: group.operatorAssignments.map((a) => a.user),
      },
    })
  } catch (error) {
    console.error('Failed to get location group:', error)
    return NextResponse.json({ error: 'Failed to retrieve location group' }, { status: 500 })
  }
}

// PUT /api/governance/groups/[id] — Update group name / description
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  if (!isOrgAdminRole(ctx.user.role)) {
    return NextResponse.json(
      { error: 'Only organization administrators may modify location groups', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const name = typeof body.name === 'string' ? body.name.trim() : undefined
    const description = typeof body.description === 'string' ? body.description.trim() : undefined

    const group = await db.locationGroup.findFirst({
      where: { id, orgId: ctx.orgId },
    })

    if (!group) {
      return NextResponse.json({ error: 'Location group not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    if (name !== undefined && !name) {
      return NextResponse.json({ error: 'Group name cannot be empty', code: 'INVALID_NAME' }, { status: 400 })
    }

    // If changing name, ensure uniqueness within organization
    if (name && name !== group.name) {
      const duplicate = await db.locationGroup.findUnique({
        where: {
          orgId_name: {
            orgId: ctx.orgId,
            name,
          },
        },
      })
      if (duplicate) {
        return NextResponse.json(
          { error: 'A location group with this name already exists in your organization', code: 'DUPLICATE_GROUP' },
          { status: 409 }
        )
      }
    }

    const updated = await db.locationGroup.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
      },
    })

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'governance.group_updated',
        targetType: 'location_group',
        targetId: id,
        metadata: JSON.stringify({
          groupId: id,
          oldName: group.name,
          newName: updated.name,
        }),
      },
    })

    return NextResponse.json({
      group: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        updatedAt: updated.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Failed to update location group:', error)
    return NextResponse.json({ error: 'Failed to update location group' }, { status: 500 })
  }
}

// DELETE /api/governance/groups/[id] — Delete group
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  if (!isOrgAdminRole(ctx.user.role)) {
    return NextResponse.json(
      { error: 'Only organization administrators may delete location groups', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  try {
    const { id } = await params

    const group = await db.locationGroup.findFirst({
      where: { id, orgId: ctx.orgId },
    })

    if (!group) {
      return NextResponse.json({ error: 'Location group not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    await db.locationGroup.delete({
      where: { id },
    })

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'governance.group_deleted',
        targetType: 'location_group',
        targetId: id,
        metadata: JSON.stringify({
          groupId: id,
          deletedName: group.name,
        }),
      },
    })

    return NextResponse.json({ success: true, message: 'Location group deleted' })
  } catch (error) {
    console.error('Failed to delete location group:', error)
    return NextResponse.json({ error: 'Failed to delete location group' }, { status: 500 })
  }
}
