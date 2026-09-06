import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolvePlatformInfo } from '@/lib/review-platforms'

export const dynamic = 'force-dynamic'

// GET /api/review-us/[slug] — public, no-auth endpoint that returns the
// business's enabled review-platform links for the Review Us Page.
//
// This is intentionally public (no auth) because customers scanning a QR code
// or clicking a link need to reach this without logging in.
//
// Returns only: business name + enabled links (URL + display name + icon).
// Does NOT return: business owner info, internal IDs, disabled links, or any
// data the customer doesn't need.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  if (!slug) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 400 })
  }

  const business = await db.business.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      industry: true,
      reviewPageTitle: true,
      reviewPageSubtitle: true,
      reviewPagePrivateFeedbackEnabled: true,
    },
  })

  if (!business) {
    return NextResponse.json({ error: 'Review page not found' }, { status: 404 })
  }

  const links = await db.reviewPlatformLink.findMany({
    where: { businessId: business.id, enabled: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      platformId: true,
      customName: true,
      customIconUrl: true,
      url: true,
    },
  })

  return NextResponse.json({
    business: {
      name: business.name,
      industry: business.industry,
      reviewPageTitle: business.reviewPageTitle || null,
      reviewPageSubtitle: business.reviewPageSubtitle || null,
      reviewPagePrivateFeedbackEnabled: business.reviewPagePrivateFeedbackEnabled ?? true,
    },
    links: links.map(l => {
      const info = resolvePlatformInfo(l)
      return {
        id: l.id,
        name: info.name,
        iconUrl: info.iconUrl,
        url: l.url,
      }
    }),
  })
}
