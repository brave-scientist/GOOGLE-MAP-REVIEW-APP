import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { assertWithinLimit, executeWithQuotaLock } from '@/lib/billing'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

// GET /api/portal/share — List active client portal shares for a business
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  const searchParams = request.nextUrl.searchParams
  const businessId = searchParams.get('businessId')

  if (!businessId) {
    return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
  }

  const denial = assertBusinessOwnership(ctx, businessId)
  if (denial) return denial

  try {
    const shares = await db.clientPortalShare.findMany({
      where: { businessId, orgId: ctx.orgId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        businessId: true,
        orgId: true,
        isEnabled: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        // Exclude tokenHash and passcodeHash from response for least privilege
      },
    })

    return NextResponse.json({ shares })
  } catch (error: any) {
    console.error('[PORTAL_SHARE_GET_ERROR]', error)
    return NextResponse.json({ error: 'Failed to list portal shares' }, { status: 500 })
  }
}

// POST /api/portal/share — Create a new shareable client portal link
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json()
    const { businessId, expiresDays, passcode } = body

    if (!businessId || typeof businessId !== 'string') {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
    }

    const denial = assertBusinessOwnership(ctx, businessId)
    if (denial) return denial

    // Generate cryptographically secure unhashed rawToken for the public share URL
    const rawToken = `portal_${crypto.randomBytes(24).toString('hex')}`
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    let passcodeHash: string | null = null
    if (passcode && typeof passcode === 'string' && passcode.trim().length > 0) {
      passcodeHash = crypto.createHash('sha256').update(passcode.trim()).digest('hex')
    }

    let expiresAt: Date | null = null
    if (expiresDays && typeof expiresDays === 'number' && expiresDays > 0) {
      expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000)
    }

    // Concurrency-safe quota check and creation
    const quotaResult = await executeWithQuotaLock(ctx.orgId, 'client_portals', 1, async (tx) => {
      return await tx.clientPortalShare.create({
        data: {
          businessId,
          orgId: ctx.orgId,
          tokenHash,
          passcodeHash,
          isEnabled: true,
          expiresAt,
        },
      })
    })

    if (!quotaResult.success) {
      return NextResponse.json(
        {
          error: quotaResult.check.reason || 'Client portal share limit reached for current plan',
          code: quotaResult.check.code || 'PLAN_UPGRADE_REQUIRED',
        },
        { status: 403 }
      )
    }

    const share = quotaResult.result

    // Audit log (never log raw tokens or passcodes)
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'portal_share.created',
        targetType: 'client_portal_share',
        targetId: share.id,
        metadata: JSON.stringify({
          businessId: share.businessId,
          hasPasscode: !!share.passcodeHash,
          expiresAt: share.expiresAt?.toISOString() || null,
        }),
      },
    })

    return NextResponse.json({
      share: {
        id: share.id,
        businessId: share.businessId,
        orgId: share.orgId,
        isEnabled: share.isEnabled,
        expiresAt: share.expiresAt,
        createdAt: share.createdAt,
      },
      rawToken, // Returned ONCE upon creation to display public link
      shareUrl: `/portal/${rawToken}`,
    }, { status: 201 })
  } catch (error: any) {
    console.error('[PORTAL_SHARE_POST_ERROR]', error)
    return NextResponse.json({ error: 'Failed to create portal share link' }, { status: 500 })
  }
}
