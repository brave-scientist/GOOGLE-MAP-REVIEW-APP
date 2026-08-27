import { NextRequest, NextResponse } from 'next/server'
import { grantCustomerConsent } from '@/lib/sms/consent'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const GrantConsentSchema = z.object({
  token: z.string().min(16, 'Valid token is required'),
  confirmed: z.boolean().refine(val => val === true, {
    message: 'Affirmative action is required to grant SMS consent.',
  }),
})

// POST /api/sms/consent/grant — Public customer affirmative consent submission
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const parseResult = GrantConsentSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: parseResult.error.issues[0]?.message || 'Invalid consent submission',
          errorCode: 'AFFIRMATIVE_ACTION_REQUIRED',
        },
        { status: 400 }
      )
    }

    const { token, confirmed } = parseResult.data
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || null
    const userAgent = request.headers.get('user-agent') || null
    const sourceUrl = request.headers.get('referer') || `/consent/${token.slice(0, 8)}...`

    const result = await grantCustomerConsent({
      rawToken: token,
      confirmed,
      ipAddress,
      userAgent,
      sourceUrl,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, errorCode: result.errorCode },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      businessName: result.businessName,
      consentedAt: result.consentedAt,
      message: `Thank you. You have successfully opted in to SMS updates from ${result.businessName}.`,
    })
  } catch (err: any) {
    console.error('Grant consent submission error:', err)
    return NextResponse.json({ error: 'Failed to process consent submission' }, { status: 500 })
  }
}
