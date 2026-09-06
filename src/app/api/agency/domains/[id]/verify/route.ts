import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'
import { isOrgAdminRole } from '@/lib/operator-governance'
import { verifyCnameRecord } from '@/lib/dns-verification'

export const dynamic = 'force-dynamic'

// POST /api/agency/domains/[id]/verify — Trigger DNS CNAME verification check for custom domain
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  if (!isOrgAdminRole(ctx.user.role)) {
    return NextResponse.json(
      { error: 'Only organization administrators can verify custom domains', code: 'INSUFFICIENT_ROLE' },
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

    // Execute actual DNS CNAME verification check via service abstraction
    const result = await verifyCnameRecord(domainRecord.domain, domainRecord.cnameTarget)

    const newStatus = result.verified ? 'VERIFIED' : 'FAILED'
    const newSslStatus = result.verified ? 'ACTIVE' : 'FAILED'

    const updated = await db.customDomain.update({
      where: { id: domainRecord.id },
      data: {
        status: newStatus,
        sslStatus: newSslStatus,
        verifiedAt: result.verified ? new Date() : null,
        lastCheckedAt: new Date(),
      },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: result.verified ? 'custom_domain.verified' : 'custom_domain.verification_failed',
        targetType: 'custom_domain',
        targetId: domainRecord.id,
        metadata: JSON.stringify({
          domain: domainRecord.domain,
          status: newStatus,
          cnameFound: result.cnameFound,
          error: result.error,
        }),
      },
    })

    return NextResponse.json({
      domain: updated,
      verified: result.verified,
      message: result.verified
        ? `Domain ${updated.domain} successfully verified!`
        : (result.error || `CNAME record check failed for ${updated.domain}. Ensure CNAME points to ${updated.cnameTarget}`),
    })
  } catch (error: any) {
    console.error('[AGENCY_DOMAIN_VERIFY_ERROR]', error)
    return NextResponse.json({ error: 'Failed to verify custom domain' }, { status: 500 })
  }
}
