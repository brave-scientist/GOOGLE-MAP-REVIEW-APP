import { db } from '@/lib/db'
import { resolvePlatformInfo } from '@/lib/review-platforms'
import { notFound } from 'next/navigation'
import { Star, ExternalLink } from 'lucide-react'
import { PrivateFeedbackModal } from '@/components/app/private-feedback-modal'

export const dynamic = 'force-dynamic'

// Public Review Us page — customers scan a QR code or click a link and land here.
// No auth required. Mobile-first design (most traffic will be QR scans from phones).
//
// This page shows the business's enabled review-platform links as tappable cards.
// Each card links out (new tab) to that platform's review-submission URL.
//
// FTC-Compliant Review Acceleration:
// - All public review links remain universally accessible without gating or filtering.
// - An optional direct private feedback channel connects directly to management.
export default async function ReviewUsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

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
  }).catch(() => null)

  if (!business) {
    notFound()
  }

  const links = await db.reviewPlatformLink.findMany({
    where: { businessId: business!.id, enabled: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      platformId: true,
      customName: true,
      customIconUrl: true,
      url: true,
    },
  })

  const resolvedLinks = links.map(l => {
    const info = resolvePlatformInfo(l)
    return {
      id: l.id,
      name: info.name,
      iconUrl: info.iconUrl,
      url: l.url,
    }
  })

  const pageTitle = business.reviewPageTitle?.trim() || 'How was your experience?'
  const pageSubtitle = business.reviewPageSubtitle?.trim() || (
    <>
      We&apos;d love to hear from you. Pick a platform below to leave a review for{' '}
      <span className="font-medium text-foreground">{business.name}</span>.
    </>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/10">
      {/* Subtle decorative top bar */}
      <div className="h-1 w-full bg-gradient-to-r from-[var(--brass)] via-[var(--brass-dark)] to-[var(--brass)]" />

      <div className="mx-auto max-w-md px-5 py-10 sm:py-14">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--brass)] to-[var(--brass-dark)] shadow-lg shadow-[var(--brass)]/20 mb-5">
            <Star className="w-8 h-8 text-white fill-white" />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mb-2 text-foreground" id="review-us-title">
            {pageTitle}
          </h1>
          <p id="review-us-subtitle" className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            {business.reviewPageSubtitle || (
              <>
                Thank you for visiting <span id="review-us-business-name" className="font-semibold text-foreground">{business.name}</span>.
                Choose a platform below to share your honest review.
              </>
            )}
          </p>
          {business.industry && (
            <p className="text-[11px] text-muted-foreground/70 mt-1 capitalize">
              {business.industry}
            </p>
          )}
        </div>

        {/* Platform cards */}
        {resolvedLinks.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-14 h-14 rounded-full bg-accent/40 flex items-center justify-center mx-auto mb-4">
              <Star className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium mb-1">No review platforms configured yet</p>
            <p className="text-xs text-muted-foreground">
              The business owner needs to add review links in their settings.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {resolvedLinks.map((link, index) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3.5 p-3.5 rounded-xl bg-card border border-border/60 hover:border-[var(--brass)]/40 hover:shadow-md hover:shadow-[var(--brass)]/5 transition-all duration-200 active:scale-[0.98]"
                style={{
                  animation: `fadeUp 0.4s ease-out ${index * 0.05}s both`,
                }}
              >
                <PlatformIcon name={link.name} iconUrl={link.iconUrl} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground group-hover:text-[var(--brass)] transition-colors">
                    {link.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Leave a review on {link.name}
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-accent/40 group-hover:bg-[var(--brass)]/10 flex items-center justify-center transition-colors">
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-[var(--brass)] transition-colors" />
                </div>
              </a>
            ))}
          </div>
        )}

        {/* Private Direct Feedback Option (when enabled) */}
        {business.reviewPagePrivateFeedbackEnabled && (
          <div className="mt-6 pt-5 border-t border-border/40">
            <PrivateFeedbackModal slug={slug} businessName={business.name} />
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 pt-6 border-t border-border/30 text-center">
          <p className="text-[11px] text-muted-foreground">
            You&apos;ll be sent directly to the platform you choose.
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            Powered by ReviewReply
          </p>
        </div>
      </div>

      <style>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}

// Platform icon with letter-avatar fallback for platforms without a logo
// Uses CSS-only fallback (no client JS) — the img has a background color
// that matches the fallback avatar, so if the img fails to load, the
// background shows through and the letter is visible underneath.
function PlatformIcon({ name, iconUrl, size = 40 }: { name: string; iconUrl: string; size?: number }) {
  const letter = name.charAt(0).toUpperCase()

  if (!iconUrl) {
    return (
      <div
        className="rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold flex-shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {letter}
      </div>
    )
  }

  // Render the letter avatar as the base layer, with the img on top.
  // If the img fails (network error, 404, etc.), the letter shows through
  // because the img element collapses to a broken-image icon that most
  // browsers render as transparent.
  return (
    <div
      className="rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold flex-shrink-0 relative overflow-hidden"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      <span className="relative z-0">{letter}</span>
      <img
        src={iconUrl}
        alt={name}
        width={size}
        height={size}
        className="absolute inset-0 z-10"
        style={{ width: size, height: size }}
      />
    </div>
  )
}
