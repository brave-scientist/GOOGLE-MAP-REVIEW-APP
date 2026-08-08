import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DraftStatus } from '@prisma/client'
import { getTenantContext, assertReviewOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'
export const maxDuration = 30 // 30 seconds for AI generation

// POST /api/reviews/[id]/draft — Generate AI draft reply using real LLM (z-ai-web-dev-sdk)
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

    if (review.draftText && !forceRegenerate) {
      return NextResponse.json({
        draft: review.draftText,
        status: review.draftStatus,
        generatedAt: new Date().toISOString(),
        model: 'cached',
      })
    }

    // Fetch the brand voice profile for this business (if one exists)
    const brandVoice = await db.brandVoiceProfile.findUnique({
      where: { businessId: review.businessId },
    })

    // Generate draft using REAL LLM via z-ai-web-dev-sdk
    const { draft, model, tokensUsed } = await generateLLMDraft({
      reviewText: review.text,
      reviewRating: review.rating,
      reviewAuthor: review.author,
      businessName: review.business.name,
      businessIndustry: review.business.industry || 'business',
      brandVoiceProfile: brandVoice ? {
        toneGuidelines: brandVoice.toneGuidelines,
        signature: brandVoice.signature,
        forbiddenPhrases: brandVoice.forbiddenPhrases,
        examples: JSON.parse(brandVoice.examples || '[]'),
      } : null,
    })

    await db.review.update({
      where: { id },
      data: {
        draftText: draft,
        draftStatus: DraftStatus.PENDING,
      },
    })

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
        }),
      },
    })

    return NextResponse.json({
      draft,
      status: DraftStatus.PENDING,
      generatedAt: new Date().toISOString(),
      model,
      tokensUsed,
    })
  } catch (error) {
    console.error('Draft generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate draft', details: String(error) },
      { status: 500 }
    )
  }
}

// Real LLM-powered draft generation
async function generateLLMDraft(params: {
  reviewText: string
  reviewRating: number
  reviewAuthor: string
  businessName: string
  businessIndustry: string
  brandVoiceProfile?: {
    toneGuidelines: string
    signature: string
    forbiddenPhrases: string
    examples: Array<{ reviewText: string; replyText: string }>
  } | null
}): Promise<{ draft: string; model: string; tokensUsed: number }> {
  const { reviewText, reviewRating, reviewAuthor, businessName, businessIndustry, brandVoiceProfile } = params
  const firstName = reviewAuthor.split(' ')[0]

  // Build the system prompt — incorporates brand voice profile if available
  let systemPrompt = `You are an expert customer service representative for ${businessName}, a ${businessIndustry} business.

Your task is to write a public reply to a customer's online review. The reply should:

1. Be warm, professional, and authentic — sound like a real person, not a bot
2. Address the customer by first name (${firstName})
3. Reference specific details from their review to show you actually read it
4. Be concise (2-4 sentences, max 60 words)
5. Match the sentiment:
   - For 4-5 star reviews: Express genuine gratitude, invite them back
   - For 3 star reviews: Thank them, acknowledge their feedback, commit to improvement
   - For 1-2 star reviews: Sincerely apologize, take responsibility, offer to make it right with a specific contact method
6. NEVER use generic phrases like "We apologize for any inconvenience" or "We take feedback seriously"
7. NEVER mention that this is an AI-generated response
8. If the review mentions anything that sounds like a legal threat (lawsuit, lawyer, BBB, attorney), respond professionally and ask them to contact management directly — do NOT apologize or admit fault
9. Do not include emojis or hashtags
10. Do not sign off with a name — the platform will append the signature automatically`

  // If a brand voice profile exists, append it to the system prompt
  if (brandVoiceProfile) {
    systemPrompt += '\n\n--- BRAND VOICE PROFILE ---\n'
    systemPrompt += 'This business has trained a brand voice profile. You MUST match their voice.\n\n'

    if (brandVoiceProfile.toneGuidelines) {
      systemPrompt += `TONE GUIDELINES:\n${brandVoiceProfile.toneGuidelines}\n\n`
    }

    if (brandVoiceProfile.signature) {
      systemPrompt += `SIGNATURE (append at the end):\n${brandVoiceProfile.signature}\n\n`
    }

    if (brandVoiceProfile.forbiddenPhrases) {
      systemPrompt += `FORBIDDEN PHRASES (never use these):\n${brandVoiceProfile.forbiddenPhrases}\n\n`
    }

    if (brandVoiceProfile.examples && brandVoiceProfile.examples.length > 0) {
      systemPrompt += `EXAMPLE REPLIES (match this tone and style):\n`
      brandVoiceProfile.examples.slice(0, 5).forEach((ex, i) => {
        systemPrompt += `\nExample ${i + 1}:\nReview: "${ex.reviewText}"\nReply: "${ex.replyText}"\n`
      })
    }

    systemPrompt += '\n--- END BRAND VOICE PROFILE ---\n'
  }

  systemPrompt += '\nWrite ONLY the reply text, no preamble, no explanation.'

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
        { role: 'assistant', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      thinking: { type: 'disabled' },
    })

    const draft = completion.choices[0]?.message?.content?.trim() || ''

    if (!draft) {
      throw new Error('Empty response from LLM')
    }

    // Clean up the draft (remove quotes if the LLM wrapped it)
    const cleanedDraft = draft.replace(/^["']|["']$/g, '').trim()

    return {
      draft: cleanedDraft,
      model: 'glm-4.6-real',
      tokensUsed: completion.usage?.total_tokens || 0,
    }
  } catch (error) {
    console.error('LLM call failed, falling back to rule-based:', error)
    // Fallback to rule-based generation if LLM fails
    const fallback = generateFallbackDraft(reviewRating, reviewAuthor, businessName, reviewText)
    return {
      draft: fallback,
      model: 'rule-based-fallback',
      tokensUsed: 0,
    }
  }
}

// Fallback rule-based draft (used only if LLM is unavailable)
function generateFallbackDraft(rating: number, author: string, business: string, text: string): string {
  const firstName = author.split(' ')[0]
  const escalationKeywords = ['lawsuit', 'BBB', 'lawyer', 'health inspector', 'attorney', 'sue']
  const lowerText = text.toLowerCase()
  if (escalationKeywords.some(k => lowerText.includes(k))) {
    return `Thank you for reaching out, ${firstName}. We take matters like this very seriously. A member of our management team will contact you within 24 hours to address your concerns directly.`
  }

  if (rating >= 4) {
    return `Thank you so much for the wonderful review, ${firstName}! We are thrilled to hear you had such a great experience at ${business}. Our team takes pride in what we do, and feedback like yours makes it all worthwhile. We cannot wait to welcome you back soon!`
  } else if (rating === 3) {
    return `Thank you for your feedback, ${firstName}. We appreciate you taking the time to share your experience at ${business}. We are always looking for ways to improve, and your input helps us do that. We hope to have the opportunity to provide you with a 5-star experience next time.`
  } else {
    return `${firstName}, we are truly sorry to hear that your experience at ${business} fell short of expectations. This is not the standard we hold ourselves to, and we would like to make it right. Please reach out to us directly so we can turn this around for you.`
  }
}
