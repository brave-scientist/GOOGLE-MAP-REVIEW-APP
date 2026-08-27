import { NextRequest, NextResponse } from 'next/server'
import { verifyConsentInvitation } from '@/lib/sms/consent'

export const dynamic = 'force-dynamic'

// GET /api/sms/consent/public/[token] — Public token validation for customer consent page
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ valid: false, error: 'Missing token' }, { status: 400 })
    }

    const verification = await verifyConsentInvitation(token)
    if (!verification.valid) {
      return NextResponse.json(
        {
          valid: false,
          errorCode: verification.errorCode,
          error: verification.error,
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      valid: true,
      businessName: verification.businessName,
      maskedContact: verification.maskedContact,
      disclosureVersion: verification.disclosureVersion,
      disclosureText: verification.disclosureText,
      expiresAt: verification.expiresAt,
    })
  } catch (err: any) {
    console.error('Public token verification error:', err)
    return NextResponse.json({ valid: false, error: 'Server error verifying token' }, { status: 500 })
  }
}
