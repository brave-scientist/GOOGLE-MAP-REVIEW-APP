import { db } from '@/lib/db'
import { notFound, redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

function resolveGoogleReviewUrl(business?: {
  name?: string
  googleLocationId?: string | null
  googlePlaceId?: string | null
} | null): string {
  if (!business) {
    return 'https://www.google.com'
  }

  // 1. If googlePlaceId is explicitly set, use the direct Google write-review Place ID URL
  if (business.googlePlaceId && business.googlePlaceId.trim().length > 0) {
    return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(business.googlePlaceId.trim())}`
  }

  // 2. If googleLocationId is not a GBP resource path and starts with ChIJ, treat as Place ID
  const locId = business.googleLocationId?.trim() || ''
  if (locId.startsWith('ChIJ') && !locId.includes('/')) {
    return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(locId)}`
  }

  // 3. Fallback: never pass GBP resource names (e.g. accounts/X/locations/Y) to ?placeid= (causes 404).
  // Safely redirect to Google review search for the business name.
  const businessName = business.name?.trim() || ''
  if (businessName) {
    return `https://www.google.com/search?q=${encodeURIComponent(businessName)}+reviews`
  }

  return 'https://www.google.com'
}

// This page is the landing target for review request links (SMS, email, QR)
// URL: /r/[token] — records the click, then redirects to Google/FB review page
// The token can be either a review request ID or a campaign ID (for QR codes)
export default async function ReviewRequestPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // Try to find a review request with this ID first
  let reviewRequest = await db.reviewRequest.findUnique({
    where: { id: token },
    include: { business: true },
  }).catch(() => null)

  // If not found, try looking up by campaign ID (QR codes link to campaign ID)
  if (!reviewRequest) {
    const campaign = await db.campaign.findUnique({
      where: { id: token },
      include: {
        business: true,
        requests: { take: 1 },
      },
    }).catch(() => null)

    if (campaign) {
      if (campaign.requests.length === 0) {
        // No review request — redirect to the business's review page
        redirect(resolveGoogleReviewUrl(campaign.business))
      }
      reviewRequest = {
        ...campaign.requests[0],
        business: campaign.business,
      }
    }
  }

  if (!reviewRequest) {
    notFound()
  }

  // Record the click
  if (reviewRequest && !reviewRequest.clickedAt) {
    await db.reviewRequest.update({
      where: { id: reviewRequest.id },
      data: { clickedAt: new Date() },
    }).catch(() => {})
  }

  // Redirect to the business's Google review page
  const business = (reviewRequest as { business?: { name?: string; googleLocationId?: string | null; googlePlaceId?: string | null } }).business
  redirect(resolveGoogleReviewUrl(business))
}
