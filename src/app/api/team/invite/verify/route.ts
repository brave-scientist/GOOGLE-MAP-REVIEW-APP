import { NextRequest, NextResponse } from 'next/server'
import { verifyInvitation } from '@/lib/team-invitations'

export const dynamic = 'force-dynamic'

// GET /api/team/invite/verify?token=...
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ status: 'INVALID', error: 'Token is required' }, { status: 400 })
    }

    const verification = await verifyInvitation(token)
    return NextResponse.json(verification)
  } catch (error) {
    console.error('Invite verification error:', error)
    return NextResponse.json({ status: 'INVALID', error: 'Verification failed' }, { status: 500 })
  }
}
