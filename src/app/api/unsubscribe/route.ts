import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// POST /api/unsubscribe — Email unsubscribe endpoint
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const normalized = email.trim().toLowerCase()

    await db.optOut.upsert({
      where: { contact: normalized },
      create: {
        contact: normalized,
        channel: 'email',
        reason: 'Unsubscribe link click',
      },
      update: {
        channel: 'email',
        reason: 'Unsubscribe link click',
      },
    })

    await db.auditLog.create({
      data: {
        action: 'email.opt_out',
        targetType: 'opt_out',
        targetId: normalized,
        metadata: JSON.stringify({ email: normalized }),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unsubscribe error:', error)
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 })
  }
}
