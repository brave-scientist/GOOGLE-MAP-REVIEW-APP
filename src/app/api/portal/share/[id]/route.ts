import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// DELETE /api/portal/share/[id] — Revoke a client portal share link
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params

  try {
    const share = await db.clientPortalShare.findFirst({
      where: { id, orgId: ctx.orgId },
    })

    if (!share) {
      return NextResponse.json({ error: 'Portal share link not found' }, { status: 404 })
    }

    await db.clientPortalShare.delete({
      where: { id: share.id },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'portal_share.revoked',
        targetType: 'client_portal_share',
        targetId: share.id,
        metadata: JSON.stringify({
          businessId: share.businessId,
          orgId: ctx.orgId,
        }),
      },
    })

    return NextResponse.json({ success: true, message: 'Portal share link revoked' })
  } catch (error: any) {
    console.error('[PORTAL_SHARE_DELETE_ERROR]', error)
    return NextResponse.json({ error: 'Failed to revoke portal share link' }, { status: 500 })
  }
}
