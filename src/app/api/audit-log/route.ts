import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'
import { isDatabasePoolError, createDatabasePoolResponse } from '@/lib/db-errors'

export const dynamic = 'force-dynamic'

/**
 * GET /api/audit-log — Tenant-scoped audit log.
 *
 * AuditLog has no orgId column; we scope by:
 * 1. targetId IN (orgId, ...businessIds)  — covers org-level and business-level events
 * 2. actorId IN (member user IDs) AND targetId = orgId — member action on this org
 *
 * We deliberately do NOT use `metadata CONTAINS orgId` — that pattern forces
 * a full-table sequential scan which causes connection saturation.
 *
 * Paginated with a hard limit of max 100 records per request.
 * Deterministic ordering: createdAt DESC, id DESC.
 */
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25')))
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const skip = (page - 1) * limit

    // 1. Get member user IDs for this org (bounded — most orgs have <50 members)
    const orgMembers = await db.orgMember.findMany({
      where: { orgId: ctx.orgId },
      select: { userId: true },
      take: 100,
    })
    const memberUserIds = orgMembers.map(m => m.userId)

    // 2. Resolve tenant-owned target IDs across child entities (templates, invitations, domains, reports, recent reviews)
    //    Strictly prevents cross-tenant data leakage if an actor belongs to multiple organizations.
    const [templates, invitations, customDomains, reports, recentReviews] = await Promise.all([
      db.replyTemplate.findMany({
        where: { businessId: { in: ctx.businessIds } },
        select: { id: true },
        take: 100,
      }),
      db.teamInvitation.findMany({
        where: { orgId: ctx.orgId },
        select: { id: true },
        take: 100,
      }),
      db.customDomain.findMany({
        where: { orgId: ctx.orgId },
        select: { id: true },
        take: 50,
      }),
      db.scheduledReport.findMany({
        where: { orgId: ctx.orgId },
        select: { id: true },
        take: 100,
      }),
      ctx.businessIds.length > 0
        ? db.review.findMany({
            where: { businessId: { in: ctx.businessIds } },
            select: { id: true },
            orderBy: { createdAt: 'desc' },
            take: 200,
          })
        : [],
    ])

    const allTenantTargetIds = [
      ctx.orgId,
      ...ctx.businessIds,
      ...templates.map(t => t.id),
      ...invitations.map(i => i.id),
      ...customDomains.map(d => d.id),
      ...reports.map(r => r.id),
      ...recentReviews.map(r => r.id),
    ]

    // 3. Scoped WHERE — strictly restricts to verified tenant entities and member account events.
    //    Uses indexed columns (targetId, targetType). Never performs unindexed metadata table scans.
    const orConditions: Array<Record<string, unknown>> = [
      { targetId: { in: allTenantTargetIds } },
    ]

    if (memberUserIds.length > 0) {
      orConditions.push({
        targetType: 'user',
        targetId: { in: memberUserIds },
      })

      // Capture tenant member actions referencing this org or its businesses in metadata
      // (e.g. templates, deleted entities, automation rules) while strictly preventing cross-org leaks.
      const tenantScopeIds = [ctx.orgId, ...ctx.businessIds]
      if (tenantScopeIds.length > 0) {
        orConditions.push({
          actorId: { in: memberUserIds },
          OR: tenantScopeIds.map(id => ({ metadata: { contains: id } })),
        })
      }
    }

    const where = { OR: orConditions }

    const [entries, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
      db.auditLog.count({ where }),
    ])

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
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      total: entries.length,
    })
  } catch (error) {
    if (isDatabasePoolError(error)) {
      return createDatabasePoolResponse()
    }
    console.error('[Audit Log API] error:', {
      route: '/api/audit-log',
      orgId: ctx.orgId,
      errorClass: (error as Error)?.name || 'UnknownError',
    })
    return NextResponse.json(
      { error: 'Failed to fetch audit log' },
      { status: 500 },
    )
  }
}
