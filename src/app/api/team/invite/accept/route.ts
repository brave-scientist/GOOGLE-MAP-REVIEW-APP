import { NextRequest, NextResponse } from 'next/server'
import { acceptTeamInvitation } from '@/lib/team-invitations'
import { createSession, getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// POST /api/team/invite/accept — Accept team invitation and mint session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, password, name } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const currentUser = await getCurrentUser(request)

    const result = await acceptTeamInvitation({
      rawToken: token.trim(),
      password,
      name,
      currentUser,
    })

    const response = NextResponse.json({
      success: true,
      message: result.message,
      user: result.user,
    })

    // Mint session cookie for the user
    await createSession(response, result.user)

    return response
  } catch (error: any) {
    const msg = error?.message || 'Failed to accept invitation'
    if (msg.includes('INVALID_TOKEN')) {
      return NextResponse.json({ error: 'Invalid or unknown invitation token', code: 'INVALID_TOKEN' }, { status: 400 })
    }
    if (msg.includes('EXPIRED')) {
      return NextResponse.json({ error: 'This invitation has expired', code: 'EXPIRED' }, { status: 410 })
    }
    if (msg.includes('ALREADY_CONSUMED')) {
      return NextResponse.json({ error: 'This invitation has already been accepted', code: 'ALREADY_CONSUMED' }, { status: 410 })
    }
    if (msg.includes('PASSWORD_REQUIRED')) {
      return NextResponse.json({ error: msg.replace('PASSWORD_REQUIRED: ', ''), code: 'PASSWORD_REQUIRED' }, { status: 400 })
    }
    if (msg.includes('EMAIL_MISMATCH')) {
      return NextResponse.json({ error: msg.replace('EMAIL_MISMATCH: ', ''), code: 'EMAIL_MISMATCH' }, { status: 403 })
    }
    if (msg.includes('INVALID_CREDENTIALS')) {
      return NextResponse.json({ error: msg.replace('INVALID_CREDENTIALS: ', ''), code: 'INVALID_CREDENTIALS' }, { status: 401 })
    }
    if (msg.includes('CONCURRENT_CONSUMPTION')) {
      return NextResponse.json({ error: 'Invitation was already accepted in another session', code: 'CONCURRENT_CONSUMPTION' }, { status: 409 })
    }

    console.error('Invite accept error:', error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
