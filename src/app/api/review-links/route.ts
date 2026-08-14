import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { generateBusinessSlug } from '@/lib/review-platforms'

export const dynamic = 'force-dynamic'

// GET /api/review-links?businessId=... — list a business's configured review platform links
// POST /api/review-links — save the full set of links for a business (replaces all)
//   body: { businessId, slug?, links: [{ platformId?, customName?, customIconUrl?, url, enabled, sortOrder }] }
//
// SEC-01: requires auth + verifies business ownership on every request.
// This is a link-generation feature — no API access to any platform.
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
      select: { slug: true, name: true },
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
  })
}

export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json()
    const { businessId, slug, links } = body as {
      businessId: string
      slug?: string | null
      links: Array<{
        platformId?: string | null
        customName?: string | null
        customIconUrl?: string | null
        url: string
        enabled?: boolean
        sortOrder?: number
      }>
    }

    if (!businessId) {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
    }

    const denied = assertBusinessOwnership(ctx, businessId)
    if (denied) return denied

    // Validate URLs — must be http(s) URLs, no javascript: or data:
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

      if (normalizedSlug !== null || slug === null) {
        await tx.business.update({
          where: { id: businessId },
          data: { slug: normalizedSlug },
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
        select: { slug: true },
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
          linkCount: links.length,
          slug: normalizedSlug,
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
      reviewUsUrl: updatedBusiness?.slug
        ? `/review-us/${updatedBusiness.slug}`
        : null,
    })
  } catch (error) {
    console.error('Review links save error:', error)
    return NextResponse.json({ error: 'Failed to save review links' }, { status: 500 })
  }
}
