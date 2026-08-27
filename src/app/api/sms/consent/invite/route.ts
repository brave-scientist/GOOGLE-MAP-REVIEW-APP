import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { createConsentInvitation } from '@/lib/sms/consent'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const CreateInviteSchema = z.object({
  businessId: z.string().min(1, 'businessId is required'),
  contact: z.union([z.string(), z.number()]).transform(c => String(c)),
  recipientName: z.string().optional(),
})

// POST /api/sms/consent/invite — Create a secure customer SMS consent invitation link
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json().catch(() => ({}))
    const parseResult = CreateInviteSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid request payload' },
        { status: 400 }
      )
    }

    const { businessId, contact, recipientName } = parseResult.data
    const denied = assertBusinessOwnership(ctx, businessId)
    if (denied) return denied

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host') || 'localhost:3000'}`
    const result = await createConsentInvitation({
      businessId,
      contact,
      recipientName,
      actorId: ctx.user.id,
      appUrl,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, errorCode: result.errorCode },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      inviteUrl: result.inviteUrl,
      expiresAt: result.expiresAt,
      token: result.rawToken,
      invitation: result.invitation,
    })
  } catch (err: any) {
    console.error('Consent invitation error:', err)
    return NextResponse.json({ error: 'Failed to create consent invitation' }, { status: 500 })
  }
}
