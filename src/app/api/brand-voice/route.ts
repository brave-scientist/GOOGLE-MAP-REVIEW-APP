import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/brand-voice — Get the brand voice profile for the first business
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    let business: { id: string } | null
    if (businessId) {
      business = await db.business.findUnique({ where: { id: businessId }, select: { id: true } })
    } else {
      business = await db.business.findFirst({ select: { id: true } })
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
  try {
    const body = await request.json()
    const { businessId, examples, toneGuidelines, signature, forbiddenPhrases } = body

    if (!businessId) {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
    }

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
