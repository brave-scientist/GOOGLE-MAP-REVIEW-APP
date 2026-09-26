import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'
import { isOrgAdminRole } from '@/lib/operator-governance'
import { assertWithinLimit, executeWithQuotaLock } from '@/lib/billing'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const DOMAIN_REGEX = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/

// GET /api/agency/domains — List custom domains registered for organization
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const domains = await db.customDomain.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ domains })
  } catch (error: any) {
    console.error('[AGENCY_DOMAINS_GET_ERROR]', error?.message || 'Unknown error')
    return NextResponse.json({ error: 'Failed to list custom domains' }, { status: 500 })
  }
}

// POST /api/agency/domains — Register new custom domain
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  if (!isOrgAdminRole(ctx.user.role)) {
    return NextResponse.json(
      { error: 'Only organization administrators can add custom domains', code: 'INSUFFICIENT_ROLE' },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const { domain } = body

    if (!domain || typeof domain !== 'string' || domain.trim().length === 0) {
      return NextResponse.json({ error: 'Domain name is required' }, { status: 400 })
    }

    const raw = domain.trim().toLowerCase()

    // Explicitly reject if protocol, path, port, query string, or spaces are supplied
    if (
      raw.includes('://') ||
      raw.includes('/') ||
      raw.includes(':') ||
      raw.includes('?') ||
      raw.includes(' ') ||
      raw.length > 253 ||
      raw.startsWith('.') ||
      raw.endsWith('.')
    ) {
      return NextResponse.json(
        { error: 'Invalid domain format. Do not include protocol (https://), paths, or ports. Example: reviews.agency.com', code: 'INVALID_DOMAIN_FORMAT' },
        { status: 400 }
      )
    }

    if (!DOMAIN_REGEX.test(raw)) {
      return NextResponse.json(
        { error: 'Invalid domain syntax. Example: reviews.agency.com', code: 'INVALID_DOMAIN_FORMAT' },
        { status: 400 }
      )
    }

    // Concurrency-safe quota lock & global uniqueness check inside transaction
    const quotaResult = await executeWithQuotaLock(ctx.orgId, 'custom_domains', 1, async (tx) => {
      // Check if domain is already registered anywhere across all organizations
      const existing = await tx.customDomain.findUnique({
        where: { domain: raw },
      })

      if (existing) {
        throw new Error('DOMAIN_EXISTS')
      }

      const verificationToken = `rr_verify_${crypto.randomBytes(16).toString('hex')}`

      return await tx.customDomain.create({
        data: {
          orgId: ctx.orgId,
          domain: raw,
          status: 'PENDING_VERIFICATION',
          verificationToken,
          cnameTarget: 'cname.reviewreply.pw',
          sslStatus: 'PENDING',
        },
      })
    })

    if (!quotaResult.success) {
      return NextResponse.json(
        {
          error: quotaResult.check.reason || 'Custom domain limit reached for current plan',
          code: quotaResult.check.code || 'PLAN_UPGRADE_REQUIRED',
        },
        { status: 403 }
      )
    }

    const newDomain = quotaResult.result

    // Audit log
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'custom_domain.created',
        targetType: 'custom_domain',
        targetId: newDomain.id,
        metadata: JSON.stringify({
          domain: newDomain.domain,
          cnameTarget: newDomain.cnameTarget,
        }),
      },
    })

    return NextResponse.json({ domain: newDomain }, { status: 201 })
  } catch (error: any) {
    if (error.message === 'DOMAIN_EXISTS') {
      return NextResponse.json(
        { error: 'This custom domain is already registered by another organization', code: 'DOMAIN_EXISTS' },
        { status: 409 }
      )
    }
    console.error('[AGENCY_DOMAINS_POST_ERROR]', error?.message || 'Unknown error')
    return NextResponse.json({ error: 'Failed to add custom domain' }, { status: 500 })
  }
}
