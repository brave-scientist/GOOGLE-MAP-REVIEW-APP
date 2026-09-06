import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// GET /api/audit-log — Tenant-scoped audit log for Settings Security view
// SEC-01: strictly scoped to the authenticated tenant's organization and businesses.
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10')))

    // 1. Get all member user IDs in this organization
    const orgMembers = await db.orgMember.findMany({
      where: { orgId: ctx.orgId },
      select: { userId: true },
    })
    const memberUserIds = orgMembers.map(m => m.userId)

    // 2. Build tenant-scoped filter criteria.
    // An audit log belongs to this tenant if:
    // - Its targetId is the orgId or one of the tenant's businessIds
    // - Its metadata JSON contains the orgId or one of the tenant's businessIds
    // - Its actorId is one of the tenant's members (and does NOT target a foreign org)
    const targetIdFilters: string[] = [ctx.orgId, ...ctx.businessIds]

    const orConditions: Array<Record<string, unknown>> = [
      { targetId: { in: targetIdFilters } },
      { metadata: { contains: ctx.orgId } },
    ]

    for (const bId of ctx.businessIds) {
      orConditions.push({ metadata: { contains: bId } })
    }

    if (memberUserIds.length > 0) {
      orConditions.push({
        actorId: { in: memberUserIds },
        NOT: [
          {
            targetType: 'organization',
            targetId: { not: ctx.orgId },
          },
        ],
      })
    }

    const entries = await db.auditLog.findMany({
      where: {
        OR: orConditions,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    // Fetch actor names/emails in single query (avoid N+1)
    const actorIds = [...new Set(entries.map(e => e.actorId).filter(Boolean))] as string[]
    const actors = actorIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, email: true, name: true },
        })
      : []
    const actorMap = new Map(actors.map(a => [a.id, a]))

    return NextResponse.json({
      entries: entries.map(e => ({
        id: e.id,
        actorId: e.actorId,
        actorEmail: e.actorId ? actorMap.get(e.actorId)?.email || null : null,
        actorName: e.actorId ? actorMap.get(e.actorId)?.name || null : null,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        metadata: e.metadata,
        ip: e.ip,
        createdAt: e.createdAt.toISOString(),
      })),
      total: entries.length,
    })
  } catch (error) {
    console.error('[Tenant Audit Log] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch audit log' },
      { status: 500 },
    )
  }
}
