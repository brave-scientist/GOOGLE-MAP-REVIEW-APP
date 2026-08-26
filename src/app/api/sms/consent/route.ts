import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import {
  recordConsent,
  hasValidConsent,
  getConsentRecord,
  SmsConsentType,
  SmsConsentSource,
} from '@/lib/sms/consent'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const SingleConsentSchema = z.object({
  businessId: z.string().min(1, 'businessId is required'),
  contact: z.union([z.string(), z.number()]).transform(c => String(c)),
  consentType: z.nativeEnum(SmsConsentType).optional().default(SmsConsentType.EXPRESS_WRITTEN),
  consentSource: z.nativeEnum(SmsConsentSource).optional().default(SmsConsentSource.CHECKOUT_FORM),
  disclosureText: z.string().min(10, 'Verbatim disclosure text is required (minimum 10 characters)'),
})

const BatchConsentSchema = z.object({
  businessId: z.string().min(1, 'businessId is required'),
  items: z.array(
    z.object({
      contact: z.union([z.string(), z.number()]).transform(c => String(c)),
      consentType: z.nativeEnum(SmsConsentType).optional().default(SmsConsentType.EXPRESS_WRITTEN),
      consentSource: z.nativeEnum(SmsConsentSource).optional().default(SmsConsentSource.API_IMPORT),
      disclosureText: z.string().min(10, 'Verbatim disclosure text is required'),
    })
  ).min(1, 'At least one consent item is required'),
})

// POST /api/sms/consent — Record affirmative SMS consent (single or batch)
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json().catch(() => ({}))
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || null
    const userAgent = request.headers.get('user-agent') || null

    // Check if batch payload
    if (Array.isArray(body?.items)) {
      const parseResult = BatchConsentSchema.safeParse(body)
      if (!parseResult.success) {
        return NextResponse.json(
          { error: parseResult.error.issues[0]?.message || 'Invalid batch payload' },
          { status: 400 }
        )
      }

      const { businessId, items } = parseResult.data
      const denied = assertBusinessOwnership(ctx, businessId)
      if (denied) return denied

      const results: Array<{ contact: string; success: boolean; error?: string; consentId?: string }> = []
      for (const item of items) {
        const res = await recordConsent({
          businessId,
          contact: item.contact,
          consentType: item.consentType,
          consentSource: item.consentSource,
          disclosureText: item.disclosureText,
          ipAddress,
          userAgent,
          actorId: ctx.user.id,
        })
        results.push({
          contact: item.contact,
          success: res.success,
          error: res.error,
          consentId: res.consent?.id,
        })
      }

      const successCount = results.filter(r => r.success).length
      return NextResponse.json({
        success: successCount > 0,
        total: items.length,
        recorded: successCount,
        results,
      })
    }

    // Single consent payload
    const parseResult = SingleConsentSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid payload' },
        { status: 400 }
      )
    }

    const { businessId, contact, consentType, consentSource, disclosureText } = parseResult.data
    const denied = assertBusinessOwnership(ctx, businessId)
    if (denied) return denied

    const result = await recordConsent({
      businessId,
      contact,
      consentType,
      consentSource,
      disclosureText,
      ipAddress,
      userAgent,
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
    console.error('Consent capture error:', err)
    return NextResponse.json({ error: 'Failed to record consent' }, { status: 500 })
  }
}

// GET /api/sms/consent?businessId=...&contact=... — Query consent status
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  const searchParams = request.nextUrl.searchParams
  const businessId = searchParams.get('businessId')
  const contact = searchParams.get('contact')

  if (!businessId || !contact) {
    return NextResponse.json(
      { error: 'Both businessId and contact parameters are required' },
      { status: 400 }
    )
  }

  const denied = assertBusinessOwnership(ctx, businessId)
  if (denied) return denied

  const consent = await getConsentRecord(businessId, contact)
  const isValid = await hasValidConsent(businessId, contact)

  return NextResponse.json({
    exists: !!consent,
    valid: isValid,
    consent: consent ? {
      id: consent.id,
      contact: consent.contact,
      consentType: consent.consentType,
      consentSource: consent.consentSource,
      consentedAt: consent.consentedAt,
      revokedAt: consent.revokedAt,
      disclosureText: consent.disclosureText,
    } : null,
  })
}
