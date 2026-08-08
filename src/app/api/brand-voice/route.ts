import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// GET /api/brand-voice — Get the brand voice profile for a business
export async function GET(request: NextRequest) {
  // SEC-01: require auth + PRO plan + org scoping
  const ctx = await getTenantContext(request, 'PRO')
  if (ctx instanceof NextResponse) return ctx

  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    let business: { id: string } | null = null

    if (businessId) {
      // SEC-01: verify ownership
      const denied = assertBusinessOwnership(ctx, businessId)
      if (denied) return denied
      business = await db.business.findUnique({ where: { id: businessId }, select: { id: true } })
    } else {
      // No businessId specified — pick the first business in the user's org
      business = await db.business.findFirst({
        where: { id: { in: ctx.businessIds } },
        select: { id: true },
      })
    }

    if (!business) {
      return NextResponse.json({ profile: null })
    }

    const profile = await db.brandVoiceProfile.findUnique({
      where: { businessId: business.id },
    })

    return NextResponse.json({
      profile: profile ? {
        id: profile.id,
        businessId: profile.businessId,
        examples: JSON.parse(profile.examples),
        toneGuidelines: profile.toneGuidelines,
        signature: profile.signature,
        forbiddenPhrases: profile.forbiddenPhrases,
        updatedAt: profile.updatedAt.toISOString(),
      } : null,
    })
  } catch (error) {
    console.error('Brand voice GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch brand voice profile' }, { status: 500 })
  }
}

// POST /api/brand-voice — Create or update the brand voice profile
export async function POST(request: NextRequest) {
  // SEC-01: require auth + PRO plan + verify businessId belongs to caller's org
  const ctx = await getTenantContext(request, 'PRO')
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json()
    const { businessId, examples, toneGuidelines, signature, forbiddenPhrases } = body

    if (!businessId) {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
    }

    // SEC-01: verify the caller's org owns this business
    const denied = assertBusinessOwnership(ctx, businessId)
    if (denied) return denied

    // Validate examples structure
    const validExamples = Array.isArray(examples) ? examples.filter(
      (e: { reviewText?: string; replyText?: string }) => e.reviewText && e.replyText
    ) : []

    const profile = await db.brandVoiceProfile.upsert({
      where: { businessId },
      create: {
        businessId,
        examples: JSON.stringify(validExamples),
        toneGuidelines: toneGuidelines || '',
        signature: signature || '',
        forbiddenPhrases: forbiddenPhrases || '',
      },
      update: {
        examples: JSON.stringify(validExamples),
        toneGuidelines: toneGuidelines || '',
        signature: signature || '',
        forbiddenPhrases: forbiddenPhrases || '',
      },
    })

    // Log the action
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'brand_voice.updated',
        targetType: 'brand_voice',
        targetId: profile.id,
        metadata: JSON.stringify({
          businessId,
          exampleCount: validExamples.length,
          hasToneGuidelines: !!toneGuidelines,
          hasSignature: !!signature,
          hasForbiddenPhrases: !!forbiddenPhrases,
        }),
      },
    })

    return NextResponse.json({
      profile: {
        id: profile.id,
        businessId: profile.businessId,
        examples: validExamples,
        toneGuidelines: profile.toneGuidelines,
        signature: profile.signature,
        forbiddenPhrases: profile.forbiddenPhrases,
        updatedAt: profile.updatedAt.toISOString(),
      },
      message: `Brand voice profile saved with ${validExamples.length} example${validExamples.length !== 1 ? 's' : ''}`,
    })
  } catch (error) {
    console.error('Brand voice POST error:', error)
    return NextResponse.json({ error: 'Failed to save brand voice profile' }, { status: 500 })
  }
}
