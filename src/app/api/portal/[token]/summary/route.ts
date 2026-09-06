import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const DEFAULT_PLATFORM_HOSTS = ['localhost', '127.0.0.1', 'reviewreply.com', 'reviewreply.pw', 'vercel.app']

// GET /api/portal/[token]/summary — Public endpoint for fetching client portal metrics & branding
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 })
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex')

    const share = await db.clientPortalShare.findUnique({
      where: { tokenHash },
      include: {
        business: {
          select: {
            id: true,
            orgId: true,
            name: true,
            industry: true,
            avgRating: true,
            reviewCount: true,
            timezone: true,
          },
        },
      },
    })

    if (!share || !share.isEnabled) {
      return NextResponse.json({ error: 'Portal link is invalid or disabled', code: 'PORTAL_DISABLED' }, { status: 404 })
    }

    if (share.expiresAt && new Date() > new Date(share.expiresAt)) {
      return NextResponse.json({ error: 'Portal link has expired', code: 'PORTAL_EXPIRED' }, { status: 410 })
    }

    // Check custom domain validation if request was routed via custom domain
    const hostHeader = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.searchParams.get('domain')
    if (hostHeader) {
      const cleanHost = hostHeader.split(':')[0].trim().toLowerCase()
      const isPlatformHost = DEFAULT_PLATFORM_HOSTS.some(h => cleanHost === h || cleanHost.endsWith(`.${h}`))

      if (!isPlatformHost) {
        const customDomain = await db.customDomain.findUnique({
          where: { domain: cleanHost },
        })

        if (!customDomain) {
          return NextResponse.json({ error: 'Custom domain not recognized', code: 'DOMAIN_NOT_FOUND' }, { status: 404 })
        }

        if (customDomain.status === 'REVOKED') {
          return NextResponse.json({ error: 'Custom domain has been revoked', code: 'DOMAIN_REVOKED' }, { status: 403 })
        }

        if (customDomain.status !== 'VERIFIED') {
          return NextResponse.json({ error: 'Custom domain is pending DNS verification', code: 'DOMAIN_NOT_VERIFIED' }, { status: 403 })
        }

        // Cross-tenant domain isolation: custom domain must belong to the same organization as the portal
        if (customDomain.orgId !== share.orgId) {
          return NextResponse.json({ error: 'Domain does not match portal organization', code: 'CROSS_TENANT_DOMAIN_MISMATCH' }, { status: 403 })
        }
      }
    }

    // Check passcode requirement
    if (share.passcodeHash) {
      const passcodeParam = request.nextUrl.searchParams.get('passcode') || request.headers.get('x-portal-passcode')
      if (!passcodeParam) {
        return NextResponse.json({ error: 'Passcode required to view portal', code: 'PASSCODE_REQUIRED' }, { status: 401 })
      }
      const testHash = crypto.createHash('sha256').update(passcodeParam.trim()).digest('hex')
      if (testHash !== share.passcodeHash) {
        return NextResponse.json({ error: 'Invalid passcode', code: 'PASSCODE_INVALID' }, { status: 403 })
      }
    }

    // Fetch agency branding for the organization owning the share
    const branding = await db.agencyBranding.findUnique({
      where: { orgId: share.orgId },
    })

    // Fetch recent reviews for this specific business only (sanitized for public display)
    const reviews = await db.review.findMany({
      where: { businessId: share.businessId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        author: true,
        authorAvatar: true,
        rating: true,
        text: true,
        source: true,
        draftStatus: true,
        replyText: true,
        createdAt: true,
      },
    })

    const formattedReviews = reviews.map(r => ({
      ...r,
      authorName: r.author,
      authorAvatarUrl: r.authorAvatar,
    }))

    // Compute rating breakdown stats
    const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    reviews.forEach(r => {
      if (r.rating >= 1 && r.rating <= 5) {
        ratingCounts[r.rating as keyof typeof ratingCounts]++
      }
    })

    return NextResponse.json({
      business: share.business,
      branding: branding || {
        brandName: share.business.name,
        logoUrl: null,
        faviconUrl: null,
        primaryColor: '#1E40AF',
        accentColor: '#3B82F6',
        supportEmail: null,
        portalTitle: `${share.business.name} Client Portal`,
        hideReviewReplyBadge: false,
      },
      metrics: {
        avgRating: share.business.avgRating || (reviews.length ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length) : 0),
        totalReviews: share.business.reviewCount || reviews.length,
        ratingCounts,
      },
      reviews: formattedReviews,
    })
  } catch (error: any) {
    console.error('[PORTAL_SUMMARY_ERROR]', error)
    return NextResponse.json({ error: 'Failed to load client portal' }, { status: 500 })
  }
}
