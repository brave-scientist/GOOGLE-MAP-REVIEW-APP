import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { hydrateTemplate, extractTokens, validateTemplate } from '@/lib/templates/token-engine'

export const dynamic = 'force-dynamic'

// POST /api/templates/preview — Hydrate template with test or review variables
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request, 'STARTER')
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json().catch(() => ({}))
    const { templateId, templateBody, businessId, reviewId, customVariables } = body

    let templateText = templateBody || ''
    let effectiveBusinessId = businessId

    // If templateId is provided, fetch from DB
    if (templateId) {
      const template = await db.replyTemplate.findUnique({
        where: { id: templateId },
      })
      if (!template || !ctx.businessIds.includes(template.businessId)) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }
      templateText = template.body
      if (!effectiveBusinessId) {
        effectiveBusinessId = template.businessId
      }
    }

    if (!templateText) {
      return NextResponse.json({ error: 'templateText or templateId is required' }, { status: 400 })
    }

    // Validate syntax
    const validation = validateTemplate(templateText)

    // Gather business context
    let business: { name: string; phone: string | null; address: string | null; industry: string | null } | null = null
    if (effectiveBusinessId) {
      const denied = assertBusinessOwnership(ctx, effectiveBusinessId)
      if (denied) return denied
      business = await db.business.findUnique({
        where: { id: effectiveBusinessId },
        select: { name: true, phone: true, address: true, industry: true },
      })
    }

    // Gather review context if reviewId is provided
    let review: { author: string; rating: number; source: string; text: string } | null = null
    if (reviewId) {
      const r = await db.review.findUnique({
        where: { id: reviewId },
        select: { author: true, rating: true, source: true, text: true, businessId: true },
      })
      if (r && ctx.businessIds.includes(r.businessId)) {
        review = r
      }
    }

    // Merge hydration context
    const hydrated = hydrateTemplate(templateText, {
      customerName: customVariables?.customerName || review?.author || 'Sarah Jenkins',
      author: customVariables?.author || review?.author || 'Sarah Jenkins',
      firstName: customVariables?.firstName,
      businessName: customVariables?.businessName || business?.name || 'Apex Business Solutions',
      businessPhone: customVariables?.businessPhone || business?.phone || '+1 (555) 019-2834',
      businessAddress: customVariables?.businessAddress || business?.address || '100 Market St, Suite 200',
      rating: customVariables?.rating ?? review?.rating ?? 5,
      platform: customVariables?.platform || review?.source || 'Google',
      managerName: customVariables?.managerName || ctx.user.name || 'Management',
      contactEmail: customVariables?.contactEmail || ctx.user.email || 'support@business.com',
      industry: business?.industry || 'Service',
    })

    return NextResponse.json({
      hydrated,
      tokens: extractTokens(templateText),
      isValid: validation.valid,
      validationErrors: validation.errors,
    })
  } catch (error) {
    console.error('Failed to preview template:', error)
    return NextResponse.json({ error: 'Failed to preview template' }, { status: 500 })
  }
}
