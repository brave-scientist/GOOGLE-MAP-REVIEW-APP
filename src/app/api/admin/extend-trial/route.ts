import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

// GET /api/admin/extend-trial — Search users for trial extension
// SEC-02: requires platform admin
export async function GET(request: NextRequest) {
  // SEC-02: require admin auth (fails closed if ADMIN_EMAILS unset)
  const adminCheck = await requireAdmin(request)
  if (adminCheck instanceof NextResponse) {
    return adminCheck
  }

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''

  if (query.length < 2) {
    return NextResponse.json({ users: [] })
  }

  const users = await db.user.findMany({
    where: {
      OR: [
        { email: { contains: query } },
        { name: { contains: query } },
      ],
    },
    include: {
      memberships: {
        include: {
          org: { select: { id: true, name: true, plan: true, trialEndsAt: true } },
        },
      },
    },
    take: 10,
  })

  return NextResponse.json({
    users: users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      org: u.memberships[0]?.org ? {
        id: u.memberships[0].org.id,
        name: u.memberships[0].org.name,
        plan: u.memberships[0].org.plan,
        trialEndsAt: u.memberships[0].org.trialEndsAt?.toISOString() || null,
      } : null,
    })),
  })
}

// POST /api/admin/extend-trial — Extend a user's trial
// SEC-02: requires platform admin
export async function POST(request: NextRequest) {
  // SEC-02: require admin auth (fails closed if ADMIN_EMAILS unset)
  const adminCheck = await requireAdmin(request)
  if (adminCheck instanceof NextResponse) {
    return adminCheck
  }
  const user = adminCheck.user

  try {
    const body = await request.json()
    const { orgId, days } = body

    if (!orgId || !days || days < 1 || days > 90) {
      return NextResponse.json({ error: 'orgId and days (1-90) are required' }, { status: 400 })
    }

    const org = await db.organization.findUnique({ where: { id: orgId } })
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Calculate new trial end date
    const currentEnd = org.trialEndsAt || new Date()
    const baseDate = currentEnd > new Date() ? currentEnd : new Date()
    const newEnd = new Date(baseDate)
    newEnd.setDate(newEnd.getDate() + days)

    await db.organization.update({
      where: { id: orgId },
      data: { trialEndsAt: newEnd },
    })

    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'admin.trial_extended',
        targetType: 'organization',
        targetId: orgId,
        metadata: JSON.stringify({
          orgId,
          orgName: org.name,
          days,
          fromTrialEndsAt: org.trialEndsAt?.toISOString() || null,
          toTrialEndsAt: newEnd.toISOString(),
        }),
      },
    })

    return NextResponse.json({
      success: true,
      orgName: org.name,
      newTrialEndsAt: newEnd.toISOString(),
      message: `Trial extended by ${days} day${days !== 1 ? 's' : ''} for ${org.name}. New expiry: ${newEnd.toLocaleDateString()}`,
    })
  } catch (error) {
    console.error('Extend trial error:', error)
    return NextResponse.json({ error: 'Failed to extend trial' }, { status: 500 })
  }
}
