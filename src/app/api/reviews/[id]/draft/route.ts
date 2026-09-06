import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DraftStatus } from '@prisma/client'
import { getTenantContext, assertReviewOwnership } from '@/lib/tenant-context'
import { SYSTEM_PRESETS, buildSystemPrompt } from '@/lib/templates/presets'
import { hydrateTemplate } from '@/lib/templates/token-engine'
import { assertWithinLimit, incrementUsage } from '@/lib/billing'

export const dynamic = 'force-dynamic'
export const maxDuration = 30 // 30 seconds for AI generation

// POST /api/reviews/[id]/draft — Generate AI draft reply or apply hydrated template (AI-02)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // SEC-01: require auth + STARTER plan + verify review belongs to caller's org
  const ctx = await getTenantContext(request, 'STARTER')
  if (ctx instanceof NextResponse) return ctx

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const forceRegenerate = body.forceRegenerate === true
    const presetId = body.presetId as string | undefined
    const templateId = body.templateId as string | undefined
    const applyTemplateDirectly = body.applyTemplateDirectly === true

    // SEC-01 (IDOR): verify the review belongs to a business in the caller's org
    const reviewCheck = await assertReviewOwnership(ctx, id, true)
    if (reviewCheck instanceof NextResponse) return reviewCheck
    const review = await db.review.findUnique({
      where: { id },
      include: { business: true },
    })
    if (!review) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }

    // Direct Template Application Mode
    if (templateId && applyTemplateDirectly) {
      const template = await db.replyTemplate.findUnique({
        where: { id: templateId },
      })
      if (!template || !ctx.businessIds.includes(template.businessId)) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }

      // Hydrate template variables
      const hydratedDraft = hydrateTemplate(template.body, {
        author: review.author,
        customerName: review.author,
        businessName: review.business.name,
        businessPhone: review.business.phone,
        businessAddress: review.business.address,
        rating: review.rating,
        platform: review.source,
        managerName: ctx.user.name || 'Management',
        contactEmail: ctx.user.email,
        industry: review.business.industry,
      })

      // Increment template usage count
      await db.replyTemplate.update({
        where: { id: template.id },
        data: { usageCount: { increment: 1 } },
      })

      await db.review.update({
        where: { id },
        data: {
          draftText: hydratedDraft,
          draftStatus: DraftStatus.PENDING,
        },
      })

      await db.auditLog.create({
        data: {
          actorId: ctx.user.id,
          action: 'draft.template_applied',
          targetType: 'review',
          targetId: review.id,
          metadata: JSON.stringify({
            reviewId: review.id,
            templateId: template.id,
            templateTitle: template.title,
            rating: review.rating,
            businessId: review.businessId,
          }),
        },
      })

      return NextResponse.json({
        draft: hydratedDraft,
        status: DraftStatus.PENDING,
        generatedAt: new Date().toISOString(),
        model: 'template-hydrated',
        templateId: template.id,
        templateTitle: template.title,
      })
    }

    // If cached draft exists and no preset/template override or forceRegenerate requested
    if (review.draftText && !forceRegenerate && !presetId && !templateId) {
      return NextResponse.json({
        draft: review.draftText,
        status: review.draftStatus,
        generatedAt: new Date().toISOString(),
        model: 'cached',
      })
    }

    // Resolve AI Preset
    let resolvedPreset: {
      id?: string
      name: string
      tone: string
      responseLength: string
      customInstructions: string | null
      signature: string | null
    } | null = null

    if (presetId) {
      // Check system presets first
      const sys = SYSTEM_PRESETS.find(p => p.id === presetId)
      if (sys) {
        resolvedPreset = {
          id: sys.id,
          name: sys.name,
          tone: sys.tone,
          responseLength: sys.responseLength,
          customInstructions: sys.customInstructions,
          signature: null,
        }
      } else {
        const customPreset = await db.aiReplyPreset.findUnique({
          where: { id: presetId },
        })
        if (customPreset && ctx.businessIds.includes(customPreset.businessId)) {
          resolvedPreset = {
            id: customPreset.id,
            name: customPreset.name,
            tone: customPreset.tone,
            responseLength: customPreset.responseLength,
            customInstructions: customPreset.customInstructions,
            signature: customPreset.signature,
          }
        }
      }
    }

    // If no preset specified, check if business has a default custom preset
    if (!resolvedPreset) {
      const defaultPreset = await db.aiReplyPreset.findFirst({
        where: { businessId: review.businessId, isDefault: true },
      })
      if (defaultPreset) {
        resolvedPreset = {
          id: defaultPreset.id,
          name: defaultPreset.name,
          tone: defaultPreset.tone,
          responseLength: defaultPreset.responseLength,
          customInstructions: defaultPreset.customInstructions,
          signature: defaultPreset.signature,
        }
      } else {
        const defaultSys = SYSTEM_PRESETS[0]
        resolvedPreset = {
          id: defaultSys.id,
          name: defaultSys.name,
          tone: defaultSys.tone,
          responseLength: defaultSys.responseLength,
          customInstructions: defaultSys.customInstructions,
          signature: null,
        }
      }
    }

    // Resolve optional template reference pattern
    let templatePattern: { title: string; body: string } | null = null
    if (templateId) {
      const t = await db.replyTemplate.findUnique({
        where: { id: templateId },
      })
      if (t && ctx.businessIds.includes(t.businessId)) {
        templatePattern = { title: t.title, body: t.body }
      }
    }

    // Fetch the brand voice profile for this business (if one exists)
    const brandVoice = await db.brandVoiceProfile.findUnique({
      where: { businessId: review.businessId },
    })

    // Entitlement limit check for AI draft generation
    const limitCheck = await assertWithinLimit(ctx.orgId, 'ai_replies', 1)
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: limitCheck.reason || 'Monthly AI reply generation limit reached for your plan. Please upgrade.',
          code: limitCheck.code || 'PLAN_UPGRADE_REQUIRED',
        },
        { status: 403 }
      )
    }

    // Generate draft using LLM with preset and brand voice integration
    const { draft, model, tokensUsed } = await generateLLMDraft({
      reviewText: review.text,
      reviewRating: review.rating,
      reviewAuthor: review.author,
      businessName: review.business.name,
      businessIndustry: review.business.industry || 'business',
      preset: resolvedPreset,
      brandVoiceProfile: brandVoice ? {
        toneGuidelines: brandVoice.toneGuidelines,
        signature: brandVoice.signature,
        forbiddenPhrases: brandVoice.forbiddenPhrases,
        examples: JSON.parse(brandVoice.examples || '[]'),
      } : null,
      templateExample: templatePattern,
    })

    await db.review.update({
      where: { id },
      data: {
        draftText: draft,
        draftStatus: DraftStatus.PENDING,
      },
    })

    await incrementUsage(ctx.orgId, 'ai_replies', 1)

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'draft.generated',
        targetType: 'review',
        targetId: review.id,
        metadata: JSON.stringify({
          reviewId: review.id,
          rating: review.rating,
          source: review.source,
          model,
          tokensUsed,
          businessId: review.businessId,
          presetId: resolvedPreset?.id,
          presetName: resolvedPreset?.name,
          templateId: templateId || null,
        }),
      },
    })

    return NextResponse.json({
      draft,
      status: DraftStatus.PENDING,
      generatedAt: new Date().toISOString(),
      model,
      tokensUsed,
      preset: resolvedPreset ? { id: resolvedPreset.id, name: resolvedPreset.name } : null,
      templateId: templateId || null,
    })
  } catch (error) {
    console.error('Draft generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate draft' },
      { status: 500 }
    )
  }
}

// Real LLM-powered draft generation with preset & token support
async function generateLLMDraft(params: {
  reviewText: string
  reviewRating: number
  reviewAuthor: string
  businessName: string
  businessIndustry: string
  preset?: {
    name?: string
    tone?: string
    responseLength?: string
    customInstructions?: string | null
    signature?: string | null
  } | null
  brandVoiceProfile?: {
    toneGuidelines: string
    signature: string
    forbiddenPhrases: string
    examples: Array<{ reviewText: string; replyText: string }>
  } | null
  templateExample?: {
    title: string
    body: string
  } | null
}): Promise<{ draft: string; model: string; tokensUsed: number }> {
  const { reviewText, reviewRating, reviewAuthor, businessName, businessIndustry, preset, brandVoiceProfile, templateExample } = params

  const systemPrompt = buildSystemPrompt({
    businessName,
    businessIndustry,
    reviewAuthor,
    reviewRating,
    reviewText,
    preset,
    brandVoice: brandVoiceProfile,
    templateExample,
  })

  const userPrompt = `Review details:
- Customer name: ${reviewAuthor}
- Rating: ${reviewRating} out of 5 stars
- Business: ${businessName} (${businessIndustry})

Review text:
"${reviewText}"

Write the reply:`

  try {
    // Dynamically import the SDK (server-side only)
    const ZAIModule = await import('z-ai-web-dev-sdk')
    const ZAI = ZAIModule.default
    const zai = await ZAI.create()

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      thinking: { type: 'disabled' },
    })

    const draft = completion.choices[0]?.message?.content?.trim() || ''

    if (!draft) {
      throw new Error('Empty response from LLM')
    }

    const cleanedDraft = draft.replace(/^["']|["']$/g, '').trim()

    return {
      draft: cleanedDraft,
      model: 'glm-4.6-real',
      tokensUsed: completion.usage?.total_tokens || 0,
    }
  } catch (error) {
    console.error('LLM call failed, falling back to rule-based:', error)
    const fallback = generateFallbackDraft({
      rating: reviewRating,
      author: reviewAuthor,
      business: businessName,
      text: reviewText,
      preset,
      signature: preset?.signature || brandVoiceProfile?.signature,
    })
    return {
      draft: fallback,
      model: 'rule-based-fallback',
      tokensUsed: 0,
    }
  }
}

// Fallback rule-based draft adapted to preset & signature
function generateFallbackDraft(options: {
  rating: number
  author: string
  business: string
  text: string
  preset?: {
    responseLength?: string
    tone?: string
  } | null
  signature?: string | null
}): string {
  const { rating, author, business, text, preset, signature } = options
  const firstName = author.trim().split(/\s+/)[0] || 'there'
  const escalationKeywords = ['lawsuit', 'BBB', 'lawyer', 'health inspector', 'attorney', 'sue']
  const lowerText = text.toLowerCase()

  let baseDraft = ''

  if (escalationKeywords.some(k => lowerText.includes(k))) {
    baseDraft = `Thank you for reaching out, ${firstName}. We take matters like this very seriously. A member of our management team will contact you directly to address your concerns.`
  } else if (rating >= 4) {
    if (preset?.responseLength === 'CONCISE') {
      baseDraft = `Thank you for the fantastic review, ${firstName}! We can't wait to see you again at ${business}.`
    } else if (preset?.responseLength === 'DETAILED') {
      baseDraft = `Thank you so much for taking the time to share your wonderful feedback, ${firstName}! Our entire team at ${business} is dedicated to providing outstanding service, and knowing you had such a positive experience means everything to us. We look forward to welcoming you back soon!`
    } else {
      baseDraft = `Thank you so much for the wonderful review, ${firstName}! We are thrilled to hear you had such a great experience at ${business}. We cannot wait to welcome you back soon!`
    }
  } else if (rating === 3) {
    if (preset?.responseLength === 'CONCISE') {
      baseDraft = `Thank you for your feedback, ${firstName}. We appreciate your input and will use it to improve.`
    } else {
      baseDraft = `Thank you for your feedback, ${firstName}. We appreciate you taking the time to share your experience at ${business}. We are constantly striving to improve and hope to deliver a 5-star experience on your next visit.`
    }
  } else {
    if (preset?.responseLength === 'CONCISE') {
      baseDraft = `${firstName}, we are very sorry your experience fell short. Please reach out so we can make this right.`
    } else {
      baseDraft = `${firstName}, we are truly sorry to hear that your experience at ${business} fell short of expectations. This is not the standard we hold ourselves to. Please reach out to us directly so we can make things right.`
    }
  }

  if (signature) {
    baseDraft += `\n\n${signature}`
  }

  return baseDraft
}
