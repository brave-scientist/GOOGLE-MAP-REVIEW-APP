import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// GET /api/export — Multi-format Data & Compliance Export
// Supports:
// - type=reviews (CSV)
// - type=campaigns (CSV)
// - type=audit-log (CSV, tenant-scoped)
// - type=dsar / type=all (JSON, complete GDPR/CCPA personal data package)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'reviews'
    const businessId = searchParams.get('businessId')

    // GDPR DSAR and audit log export are fundamental compliance rights available to all users (FREE+).
    // Commercial reviews/campaigns CSV exports require STARTER+.
    const isComplianceExport = type === 'dsar' || type === 'all' || type === 'audit-log'
    const requiredPlan = isComplianceExport ? 'FREE' : 'STARTER'

    const ctx = await getTenantContext(request, requiredPlan)
    if (ctx instanceof NextResponse) return ctx

    // SEC-01: if specific businessId specified, verify ownership
    if (businessId && businessId !== 'all') {
      const denied = assertBusinessOwnership(ctx, businessId)
      if (denied) return denied
    }

    // ──────────────────────────────────────────────────
    // 1. REVIEWS EXPORT (CSV)
    // ──────────────────────────────────────────────────
    if (type === 'reviews') {
      const where = businessId && businessId !== 'all'
        ? { businessId }
        : { businessId: { in: ctx.businessIds } }
      const reviews = await db.review.findMany({
        where,
        include: { business: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      })

      const rows = [
        ['ID', 'Author', 'Rating', 'Source', 'Title', 'Text', 'Sentiment', 'Topics', 'Business', 'Draft Status', 'Reply Text', 'Replied At', 'Created At'].join(','),
        ...reviews.map(r => [
          r.id,
          `"${r.author.replace(/"/g, '""')}"`,
          r.rating,
          r.source,
          `"${(r.title || '').replace(/"/g, '""')}"`,
          `"${r.text.replace(/"/g, '""')}"`,
          r.sentimentScore || '',
          `"${r.topics || ''}"`,
          `"${r.business.name.replace(/"/g, '""')}"`,
          r.draftStatus,
          `"${(r.replyText || '').replace(/"/g, '""')}"`,
          r.repliedAt?.toISOString() || '',
          r.createdAt.toISOString(),
        ].join(',')),
      ]

      const csv = rows.join('\n')
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="reviews-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }

    // ──────────────────────────────────────────────────
    // 2. CAMPAIGNS EXPORT (CSV)
    // ──────────────────────────────────────────────────
    if (type === 'campaigns') {
      const campaigns = await db.campaign.findMany({
        where: { businessId: { in: ctx.businessIds } },
        include: { business: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      })

      const rows = [
        ['ID', 'Name', 'Business', 'Status', 'Channel Mix', 'Sent', 'Clicked', 'Converted', 'Created At'].join(','),
        ...campaigns.map(c => [
          c.id,
          `"${c.name.replace(/"/g, '""')}"`,
          `"${c.business.name.replace(/"/g, '""')}"`,
          c.status,
          c.channelMix,
          c.sentCount,
          c.clickCount,
          c.conversionCount,
          c.createdAt.toISOString(),
        ].join(',')),
      ]

      const csv = rows.join('\n')
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="campaigns-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }

    // Helper to query tenant-scoped audit logs
    const getTenantScopedAuditLogs = async (limit = 1000) => {
      const orgMembers = await db.orgMember.findMany({
        where: { orgId: ctx.orgId },
        select: { userId: true },
      })
      const memberUserIds = orgMembers.map(m => m.userId)
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

      return db.auditLog.findMany({
        where: { OR: orConditions },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
    }

    // ──────────────────────────────────────────────────
    // 3. AUDIT LOG EXPORT (CSV) — DEF-04
    // ──────────────────────────────────────────────────
    if (type === 'audit-log') {
      const logs = await getTenantScopedAuditLogs(2000)
      const actorIds = [...new Set(logs.map(l => l.actorId).filter(Boolean))] as string[]
      const actors = actorIds.length > 0
        ? await db.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, name: true, email: true },
          })
        : []
      const actorMap = new Map(actors.map(a => [a.id, a.email || a.name || a.id]))

      const escapeCsv = (val: string | null | undefined) => `"${(val || '').replace(/"/g, '""')}"`

      const rows = [
        ['ID', 'Timestamp', 'Action', 'Actor', 'Target Type', 'Target ID', 'IP', 'Metadata'].join(','),
        ...logs.map(l => [
          l.id,
          l.createdAt.toISOString(),
          escapeCsv(l.action),
          escapeCsv(l.actorId ? (actorMap.get(l.actorId) || l.actorId) : 'System'),
          escapeCsv(l.targetType),
          escapeCsv(l.targetId),
          escapeCsv(l.ip ? l.ip.replace(/:\d+$/, '') : ''), // IP masked of port
          escapeCsv(l.metadata),
        ].join(',')),
      ]

      const csv = rows.join('\n')

      // Record export in audit trail
      await db.auditLog.create({
        data: {
          actorId: ctx.user.id,
          action: 'compliance.audit_log_exported',
          targetType: 'organization',
          targetId: ctx.orgId,
          metadata: JSON.stringify({ rowCount: logs.length }),
        },
      })

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }

    // ──────────────────────────────────────────────────
    // 4. DSAR PERSONAL DATA ARCHIVE (JSON) — DEF-04
    // ──────────────────────────────────────────────────
    if (type === 'dsar' || type === 'all') {
      // 1. User profile (strictly omitting passwordHash, sessionVersion)
      const user = await db.user.findUnique({
        where: { id: ctx.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      // 2. Organization info (strictly omitting stripe tokens/customer secrets)
      const organization = await db.organization.findUnique({
        where: { id: ctx.orgId },
        select: {
          id: true,
          name: true,
          plan: true,
          trialEndsAt: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      // 3. User's memberships
      const memberships = await db.orgMember.findMany({
        where: { userId: ctx.user.id },
        select: {
          id: true,
          orgId: true,
          role: true,
          createdAt: true,
        },
      })

      // 4. Authorized businesses (strictly omitting integration secrets/OAuth tokens)
      const businesses = await db.business.findMany({
        where: { id: { in: ctx.businessIds } },
        select: {
          id: true,
          name: true,
          slug: true,
          industry: true,
          timezone: true,
          address: true,
          phone: true,
          avgRating: true,
          reviewCount: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      // 5. Reviews
      const reviews = await db.review.findMany({
        where: { businessId: { in: ctx.businessIds } },
        select: {
          id: true,
          businessId: true,
          author: true,
          rating: true,
          source: true,
          title: true,
          text: true,
          sentimentScore: true,
          topics: true,
          draftStatus: true,
          draftText: true,
          replyText: true,
          repliedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      })

      // 6. Campaigns
      const campaigns = await db.campaign.findMany({
        where: { businessId: { in: ctx.businessIds } },
        select: {
          id: true,
          businessId: true,
          name: true,
          description: true,
          channelMix: true,
          status: true,
          sentCount: true,
          clickCount: true,
          conversionCount: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      })

      // 7. Customer SMS Consent records (for businesses owned by this tenant)
      const consentRecords = await db.customerSmsConsent.findMany({
        where: { businessId: { in: ctx.businessIds } },
        select: {
          id: true,
          businessId: true,
          contact: true,
          status: true,
          consentType: true,
          consentSource: true,
          currentVersion: true,
          disclosureText: true,
          consentedAt: true,
          revokedAt: true,
        },
        orderBy: { consentedAt: 'desc' },
      })

      // 8. Deletion requests
      const deletionRequests = await db.deletionRequest.findMany({
        where: {
          OR: [
            { userId: ctx.user.id },
            { orgId: ctx.orgId },
          ],
        },
        select: {
          id: true,
          status: true,
          reason: true,
          scheduledFor: true,
          requestedAt: true,
          processedAt: true,
          cancelledAt: true,
        },
      })

      // 9. Tenant Audit Logs
      const auditLogs = await getTenantScopedAuditLogs(500)

      const dsarArchive = {
        exportMetadata: {
          type: 'DSAR_PERSONAL_DATA_ARCHIVE',
          version: '1.0',
          requestedAt: new Date().toISOString(),
          userId: ctx.user.id,
          orgId: ctx.orgId,
          legalNotice: 'ReviewReply GDPR/CCPA Data Subject Access Request. This archive contains personal and tenant data associated with your authenticated account.',
        },
        user,
        organization,
        memberships,
        businesses,
        reviews,
        campaigns,
        consentRecords,
        deletionRequests,
        auditLogs: auditLogs.map(l => ({
          id: l.id,
          action: l.action,
          targetType: l.targetType,
          targetId: l.targetId,
          createdAt: l.createdAt,
        })),
      }

      // Record export in audit trail
      await db.auditLog.create({
        data: {
          actorId: ctx.user.id,
          action: 'compliance.dsar_exported',
          targetType: 'user',
          targetId: ctx.user.id,
          metadata: JSON.stringify({
            orgId: ctx.orgId,
            businessesCount: businesses.length,
            reviewsCount: reviews.length,
          }),
        },
      })

      return new NextResponse(JSON.stringify(dsarArchive, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="dsar-export-${new Date().toISOString().slice(0, 10)}.json"`,
        },
      })
    }

    return NextResponse.json({ error: 'Invalid export type' }, { status: 400 })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json(
      { error: 'Failed to export' },
      { status: 500 }
    )
  }
}
