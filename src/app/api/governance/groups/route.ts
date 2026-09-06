import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'
import { isOrgAdminRole } from '@/lib/operator-governance'

export const dynamic = 'force-dynamic'

// GET /api/governance/groups — List all location groups for the tenant
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const groups = await db.locationGroup.findMany({
      where: { orgId: ctx.orgId },
      include: {
        locations: {
          include: {
            business: {
              select: { id: true, name: true, address: true, industry: true },
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
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
        locationCount: g.locations.length,
        locations: g.locations.map((l) => l.business),
        operatorCount: g.operatorAssignments.length,
        operators: g.operatorAssignments.map((a) => a.user),
      })),
    })
  } catch (error) {
    console.error('Failed to list location groups:', error)
    return NextResponse.json({ error: 'Failed to list location groups' }, { status: 500 })
  }
}

// POST /api/governance/groups — Create a new location group
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  if (!isOrgAdminRole(ctx.user.role)) {
    return NextResponse.json(
      { error: 'Only organization administrators may create location groups', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  try {
    const body = await request.json().catch(() => ({}))
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : null
    const rawBusinessIds = Array.isArray(body.businessIds) ? (body.businessIds as string[]) : []
    const businessIds = Array.from(
      new Set(rawBusinessIds.map((b) => (typeof b === 'string' ? b.trim() : '')).filter(Boolean))
    )

    if (!name) {
      return NextResponse.json({ error: 'Group name is required', code: 'INVALID_NAME' }, { status: 400 })
    }

    // Check unique group name within organization
    const existing = await db.locationGroup.findUnique({
      where: {
        orgId_name: {
          orgId: ctx.orgId,
          name,
        },
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'A location group with this name already exists in your organization', code: 'DUPLICATE_GROUP' },
        { status: 409 }
      )
    }

    // Validate any passed businessIds belong to the caller's organization
    for (const bId of businessIds) {
      if (!ctx.allOrgBusinessIds.includes(bId)) {
        return NextResponse.json(
          { error: `Location ${bId} does not belong to your organization`, code: 'CROSS_TENANT_LOCATION' },
          { status: 400 }
        )
      }
    }

    // Create group with initial locations atomically
    const group = await db.locationGroup.create({
      data: {
        orgId: ctx.orgId,
        name,
        description,
        locations: {
          create: businessIds.map((bId) => ({
            businessId: bId,
          })),
        },
      },
      include: {
        locations: {
          include: {
            business: {
              select: { id: true, name: true },
            },
          },
        },
      },
    })

    // Record audit log
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'governance.group_created',
        targetType: 'location_group',
        targetId: group.id,
        metadata: JSON.stringify({
          groupId: group.id,
          name: group.name,
          locationCount: businessIds.length,
          businessIds,
        }),
      },
    })

    return NextResponse.json(
      {
        group: {
          id: group.id,
          name: group.name,
          description: group.description,
          locationCount: group.locations.length,
          locations: group.locations.map((l) => l.business),
          createdAt: group.createdAt.toISOString(),
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Failed to create location group:', error)
    return NextResponse.json({ error: 'Failed to create location group' }, { status: 500 })
  }
}
