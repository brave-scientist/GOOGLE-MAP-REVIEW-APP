import { db } from '@/lib/db'
import { notFound, redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

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
        // No review request — just redirect to the business's review page
        const reviewUrl = campaign.business?.googleLocationId
          ? `https://search.google.com/local/writereview?placeid=${campaign.business.googleLocationId}`
          : `https://www.google.com/search?q=${encodeURIComponent(campaign.business?.name || '')}+reviews`
        redirect(reviewUrl)
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
  const business = (reviewRequest as { business?: { name?: string; googleLocationId?: string | null } }).business
  const reviewUrl = business?.googleLocationId
    ? `https://search.google.com/local/writereview?placeid=${business.googleLocationId}`
    : `https://www.google.com/search?q=${encodeURIComponent(business?.name || '')}+reviews`

  redirect(reviewUrl)
}
