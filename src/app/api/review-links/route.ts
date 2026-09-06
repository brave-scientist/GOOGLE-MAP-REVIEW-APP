import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { generateBusinessSlug } from '@/lib/review-platforms'

import { Role } from '@prisma/client'

export const dynamic = 'force-dynamic'

// GET /api/review-links?businessId=... — list a business's configured review platform links & landing page settings
// POST /api/review-links — save the full set of links and landing page customization for a business
//   body: { businessId, slug?, links: [{ platformId?, customName?, customIconUrl?, url, enabled, sortOrder }], reviewPageTitle?, reviewPageSubtitle?, reviewPagePrivateFeedbackEnabled? }
//
// SEC-01: requires auth + verifies business ownership + role check on mutation.
// Permitted roles for mutation: OWNER, ADMIN, AGENCY_ADMIN, CLIENT_ADMIN.
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('businessId')

  if (!businessId) {
    return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
  }

  const denied = assertBusinessOwnership(ctx, businessId)
  if (denied) return denied

  const [links, business] = await Promise.all([
    db.reviewPlatformLink.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    db.business.findUnique({
      where: { id: businessId },
      select: {
        slug: true,
        name: true,
        reviewPageTitle: true,
        reviewPageSubtitle: true,
        reviewPagePrivateFeedbackEnabled: true,
      },
    }),
  ])

  return NextResponse.json({
    links: links.map(l => ({
      id: l.id,
      platformId: l.platformId,
      customName: l.customName,
      customIconUrl: l.customIconUrl,
      url: l.url,
      enabled: l.enabled,
      sortOrder: l.sortOrder,
    })),
    slug: business?.slug || null,
    businessName: business?.name || null,
    reviewPageTitle: business?.reviewPageTitle || null,
    reviewPageSubtitle: business?.reviewPageSubtitle || null,
    reviewPagePrivateFeedbackEnabled: business?.reviewPagePrivateFeedbackEnabled ?? true,
  })
}

export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  // Role authorization: require OWNER, ADMIN, AGENCY_ADMIN, or CLIENT_ADMIN
  const allowedRoles: Role[] = [Role.OWNER, Role.ADMIN, Role.AGENCY_ADMIN, Role.CLIENT_ADMIN]
  if (!allowedRoles.includes(ctx.user.role as Role)) {
    return NextResponse.json(
      { error: 'Forbidden: Insufficient permissions to modify review page settings', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const {
      businessId,
      slug,
      links,
      reviewPageTitle,
      reviewPageSubtitle,
      reviewPagePrivateFeedbackEnabled,
    } = body as {
      businessId: string
      slug?: string | null
      links?: Array<{
        platformId?: string | null
        customName?: string | null
        customIconUrl?: string | null
        url: string
        enabled?: boolean
        sortOrder?: number
      }>
      reviewPageTitle?: string | null
      reviewPageSubtitle?: string | null
      reviewPagePrivateFeedbackEnabled?: boolean
    }

    if (!businessId) {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
    }

    const denied = assertBusinessOwnership(ctx, businessId)
    if (denied) return denied

    // Validate URLs — must be http(s) URLs, no javascript: or data:
    if (Array.isArray(links)) {
      for (const link of links) {
        if (!link.url || typeof link.url !== 'string') {
          return NextResponse.json({ error: 'All links must have a url' }, { status: 400 })
        }
        try {
          const parsed = new URL(link.url)
          if (!['http:', 'https:'].includes(parsed.protocol)) {
            return NextResponse.json(
              { error: `Invalid URL protocol: ${parsed.protocol}. Only http/https allowed.` },
              { status: 400 },
            )
          }
        } catch {
          return NextResponse.json(
            { error: `Invalid URL: ${link.url}` },
            { status: 400 },
          )
        }
      }
    }

    // Clean and sanitize text fields
    const cleanTitle = typeof reviewPageTitle === 'string'
      ? reviewPageTitle.trim().slice(0, 120)
      : (reviewPageTitle === null ? null : undefined)
    const cleanSubtitle = typeof reviewPageSubtitle === 'string'
      ? reviewPageSubtitle.trim().slice(0, 250)
      : (reviewPageSubtitle === null ? null : undefined)
    const cleanFeedbackEnabled = typeof reviewPagePrivateFeedbackEnabled === 'boolean'
      ? reviewPagePrivateFeedbackEnabled
      : undefined

    // If a slug is provided, normalize it and ensure uniqueness
    let normalizedSlug: string | null = null
    if (slug) {
      normalizedSlug = generateBusinessSlug(slug)
      if (normalizedSlug) {
        const existing = await db.business.findFirst({
          where: {
            slug: normalizedSlug,
            NOT: { id: businessId },
          },
          select: { id: true },
        })
        if (existing) {
          return NextResponse.json(
            { error: `The URL "/review-us/${normalizedSlug}" is already taken by another business. Please choose a different one.` },
            { status: 409 },
          )
        }
      }
    }

    await db.$transaction(async (tx) => {
      if (Array.isArray(links)) {
        await tx.reviewPlatformLink.deleteMany({ where: { businessId } })

        if (links.length > 0) {
          await tx.reviewPlatformLink.createMany({
            data: links.map((link, index) => ({
              businessId,
              platformId: link.platformId || null,
              customName: link.customName || null,
              customIconUrl: link.customIconUrl || null,
              url: link.url,
              enabled: link.enabled ?? true,
              sortOrder: link.sortOrder ?? index,
            })),
          })
        }
      }

      const businessUpdateData: Record<string, any> = {}
      if (normalizedSlug !== null || slug === null) {
        businessUpdateData.slug = normalizedSlug
      }
      if (cleanTitle !== undefined) {
        businessUpdateData.reviewPageTitle = cleanTitle
      }
      if (cleanSubtitle !== undefined) {
        businessUpdateData.reviewPageSubtitle = cleanSubtitle
      }
      if (cleanFeedbackEnabled !== undefined) {
        businessUpdateData.reviewPagePrivateFeedbackEnabled = cleanFeedbackEnabled
      }

      if (Object.keys(businessUpdateData).length > 0) {
        await tx.business.update({
          where: { id: businessId },
          data: businessUpdateData,
        })
      }
    })

    const [savedLinks, updatedBusiness] = await Promise.all([
      db.reviewPlatformLink.findMany({
        where: { businessId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      db.business.findUnique({
        where: { id: businessId },
        select: {
          slug: true,
          reviewPageTitle: true,
          reviewPageSubtitle: true,
          reviewPagePrivateFeedbackEnabled: true,
        },
      }),
    ])

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'review_links.updated',
        targetType: 'business',
        targetId: businessId,
        metadata: JSON.stringify({
          businessId,
          linkCount: Array.isArray(links) ? links.length : savedLinks.length,
          slug: normalizedSlug,
          customTitle: cleanTitle,
          privateFeedbackEnabled: cleanFeedbackEnabled,
        }),
      },
    })

    return NextResponse.json({
      success: true,
      links: savedLinks.map(l => ({
        id: l.id,
        platformId: l.platformId,
        customName: l.customName,
        customIconUrl: l.customIconUrl,
        url: l.url,
        enabled: l.enabled,
        sortOrder: l.sortOrder,
      })),
      slug: updatedBusiness?.slug || null,
      reviewPageTitle: updatedBusiness?.reviewPageTitle || null,
      reviewPageSubtitle: updatedBusiness?.reviewPageSubtitle || null,
      reviewPagePrivateFeedbackEnabled: updatedBusiness?.reviewPagePrivateFeedbackEnabled ?? true,
      reviewUsUrl: updatedBusiness?.slug
        ? `/review-us/${updatedBusiness.slug}`
        : null,
    })
  } catch (error) {
    console.error('Review links save error:', error)
    return NextResponse.json({ error: 'Failed to save review links' }, { status: 500 })
  }
}
