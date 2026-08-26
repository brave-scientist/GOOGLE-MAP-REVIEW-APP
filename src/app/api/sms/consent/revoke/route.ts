import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { revokeConsent } from '@/lib/sms/consent'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const RevokeConsentSchema = z.object({
  businessId: z.string().min(1, 'businessId is required'),
  contact: z.union([z.string(), z.number()]).transform(c => String(c)),
  reason: z.string().optional(),
})

// POST /api/sms/consent/revoke — Revoke affirmative SMS consent
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json().catch(() => ({}))
    const parseResult = RevokeConsentSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid payload' },
        { status: 400 }
      )
    }

    const { businessId, contact, reason } = parseResult.data
    const denied = assertBusinessOwnership(ctx, businessId)
    if (denied) return denied

    const result = await revokeConsent({
      businessId,
      contact,
      reason,
      actorId: ctx.user.id,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, errorCode: result.errorCode },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      consent: result.consent,
    })
  } catch (err: any) {
    console.error('Consent revocation error:', err)
    return NextResponse.json({ error: 'Failed to revoke consent' }, { status: 500 })
  }
}
