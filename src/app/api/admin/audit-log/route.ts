import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

// GET /api/admin/audit-log — paginated, filterable platform-wide audit log
// SEC-02: requires platform admin
//
// Query params:
//   page      — 1-indexed page number (default 1)
//   limit     — page size, capped at 200 (default 50)
//   action    — filter by action substring (case-insensitive contains)
//   targetType— filter by exact targetType
//   actorId   — filter by exact actorId
//   since     — ISO date string; only entries at/after this timestamp
//   until     — ISO date string; only entries before this timestamp
export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request)
  if (adminCheck instanceof NextResponse) {
    return adminCheck
  }

  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')))
    const action = searchParams.get('action') || undefined
    const targetType = searchParams.get('targetType') || undefined
    const actorId = searchParams.get('actorId') || undefined
    const since = searchParams.get('since')
    const until = searchParams.get('until')

    const where: Record<string, unknown> = {}
    if (action) where.action = { contains: action }
    if (targetType) where.targetType = targetType
    if (actorId) where.actorId = actorId
    if (since || until) {
      const createdAt: Record<string, Date> = {}
      if (since) createdAt.gte = new Date(since)
      if (until) createdAt.lt = new Date(until)
      where.createdAt = createdAt
    }

    const [entries, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.auditLog.count({ where }),
    ])

    // Fetch actor emails in a single query (avoid N+1)
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
      filters: {
        action: action || null,
        targetType: targetType || null,
        actorId: actorId || null,
        since: since || null,
        until: until || null,
      },
    })
  } catch (error) {
    console.error('Audit log API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch audit log' },
      { status: 500 },
    )
  }
}
