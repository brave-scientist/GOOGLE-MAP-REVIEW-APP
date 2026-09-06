import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'
import { isOrgAdminRole } from '@/lib/operator-governance'

export const dynamic = 'force-dynamic'

// GET /api/agency/domains/[id] — View verification status and domain details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params

  try {
    const domainRecord = await db.customDomain.findFirst({
      where: { id, orgId: ctx.orgId },
    })

    if (!domainRecord) {
      return NextResponse.json({ error: 'Custom domain not found' }, { status: 404 })
    }

    return NextResponse.json({ domain: domainRecord })
  } catch (error: any) {
    console.error('[AGENCY_DOMAIN_GET_ERROR]', error)
    return NextResponse.json({ error: 'Failed to retrieve custom domain' }, { status: 500 })
  }
}

// DELETE /api/agency/domains/[id] — Remove/revoke custom domain
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  if (!isOrgAdminRole(ctx.user.role)) {
    return NextResponse.json(
      { error: 'Only organization administrators can delete custom domains', code: 'INSUFFICIENT_ROLE' },
      { status: 403 }
    )
  }

  const { id } = await params

  try {
    const domainRecord = await db.customDomain.findFirst({
      where: { id, orgId: ctx.orgId },
    })

    if (!domainRecord) {
      return NextResponse.json({ error: 'Custom domain not found' }, { status: 404 })
    }

    await db.customDomain.delete({
      where: { id: domainRecord.id },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'custom_domain.revoked',
        targetType: 'custom_domain',
        targetId: domainRecord.id,
        metadata: JSON.stringify({
          domain: domainRecord.domain,
          orgId: ctx.orgId,
        }),
      },
    })

    return NextResponse.json({ success: true, message: 'Custom domain removed successfully' })
  } catch (error: any) {
    console.error('[AGENCY_DOMAIN_DELETE_ERROR]', error)
    return NextResponse.json({ error: 'Failed to delete custom domain' }, { status: 500 })
  }
}
