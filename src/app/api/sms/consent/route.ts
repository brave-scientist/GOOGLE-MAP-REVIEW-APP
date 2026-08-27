import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import {
  hasValidConsent,
  getConsentStatus,
  importConsentEvidence,
  ImportConsentItem,
} from '@/lib/sms/consent'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const ImportSingleSchema = z.object({
  businessId: z.string().min(1, 'businessId is required'),
  contact: z.union([z.string(), z.number()]).transform(c => String(c)),
  externalSystem: z.string().min(1, 'externalSystem is required for evidence provenance'),
  externalRecordId: z.string().optional(),
  originalTimestamp: z.string().min(1, 'originalTimestamp is required'),
  originalDisclosureText: z.string().min(10, 'originalDisclosureText is required'),
  evidenceDescription: z.string().optional(),
})

const ImportBatchSchema = z.object({
  businessId: z.string().min(1, 'businessId is required'),
  items: z.array(
    z.object({
      contact: z.union([z.string(), z.number()]).transform(c => String(c)),
      externalSystem: z.string().min(1, 'externalSystem is required for evidence provenance'),
      externalRecordId: z.string().optional(),
      originalTimestamp: z.string().min(1, 'originalTimestamp is required'),
      originalDisclosureText: z.string().min(10, 'originalDisclosureText is required'),
      evidenceDescription: z.string().optional(),
    })
  ).min(1, 'At least one item is required'),
})

// POST /api/sms/consent — Import verified external consent evidence with provenance
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json().catch(() => ({}))
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || null
    const userAgent = request.headers.get('user-agent') || null

    let businessId: string
    let items: ImportConsentItem[]

    if (Array.isArray(body?.items)) {
      const parseResult = ImportBatchSchema.safeParse(body)
      if (!parseResult.success) {
        return NextResponse.json(
          { error: parseResult.error.issues[0]?.message || 'Invalid batch payload' },
          { status: 400 }
        )
      }
      businessId = parseResult.data.businessId
      items = parseResult.data.items
    } else {
      const parseResult = ImportSingleSchema.safeParse(body)
      if (!parseResult.success) {
        return NextResponse.json(
          { error: parseResult.error.issues[0]?.message || 'Invalid payload. Structured provenance fields are required.' },
          { status: 400 }
        )
      }
      businessId = parseResult.data.businessId
      items = [
        {
          contact: parseResult.data.contact,
          externalSystem: parseResult.data.externalSystem,
          externalRecordId: parseResult.data.externalRecordId,
          originalTimestamp: parseResult.data.originalTimestamp,
          originalDisclosureText: parseResult.data.originalDisclosureText,
          evidenceDescription: parseResult.data.evidenceDescription,
        },
      ]
    }

    const denied = assertBusinessOwnership(ctx, businessId)
    if (denied) return denied

    const importResult = await importConsentEvidence({
      businessId,
      items,
      actorId: ctx.user.id,
      ipAddress,
      userAgent,
    })

    return NextResponse.json({
      success: importResult.verifiedCount > 0,
      total: importResult.total,
      verifiedCount: importResult.verifiedCount,
      unverifiedCount: importResult.unverifiedCount,
      results: importResult.results,
    })
  } catch (err: any) {
    console.error('Consent import error:', err)
    return NextResponse.json({ error: 'Failed to import consent evidence' }, { status: 500 })
  }
}

// GET /api/sms/consent?businessId=...&contact=... — Query sanitized consent status
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

  const statusInfo = await getConsentStatus(businessId, contact)
  const isValid = await hasValidConsent(businessId, contact)

  return NextResponse.json({
    eligible: isValid,
    status: statusInfo.status,
    consentType: statusInfo.consentType || null,
    consentSource: statusInfo.consentSource || null,
    consentGrantedAt: statusInfo.consentGrantedAt || null,
    disclosureVersion: statusInfo.disclosureVersion || null,
  })
}
