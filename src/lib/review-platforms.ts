// lib/review-platforms.ts — Curated catalog of review platforms for local service businesses
//
// This is the "Review Us Page" feature: a business configures their specific
// review-submission URLs on platforms their customers use. Customers pick a
// platform and get sent straight to that platform's review page.
//
// IMPORTANT: This is a link-generation feature, NOT a sync integration.
// No platform in this catalog has API access from our app. The UI must
// never use "connected" or "syncing" language — these are just stored URLs.
//
// Catalog curated for local service businesses in USA/UK markets.

export type PlatformCategory =
  | 'general'
  | 'restaurants'
  | 'hotels'
  | 'home-services'
  | 'medical'
  | 'legal'
  | 'b2b'
  | 'automotive'

export interface ReviewPlatform {
  id: string          // unique identifier (used as platformId in DB)
  name: string
  category: PlatformCategory
  iconUrl: string     // URL to the platform's logo (uses Simple Icons CDN where available)
  urlHint: string     // shown in the settings UI to help the user find their URL
  popular?: boolean   // surfaced at the top of the catalog
}

// Icon URLs use Simple Icons (https://simpleicons.org) — a CDN of brand SVGs.
// For platforms not on Simple Icons, we use a generic letter-avatar fallback
// rendered in the UI (the `iconUrl` can be empty and the component handles it).
const SI = 'https://cdn.simpleicons.org'  // simpleicons.org CDN

export const REVIEW_PLATFORMS: ReviewPlatform[] = [
  // ── General ──────────────────────────────────────────────
  {
    id: 'google',
    name: 'Google',
    category: 'general',
    iconUrl: `${SI}/google`,
    urlHint: 'Search Google for your business, click "Write a review", copy that URL.',
    popular: true,
  },
  {
    id: 'facebook',
    name: 'Facebook',
    category: 'general',
    iconUrl: `${SI}/facebook`,
    urlHint: 'Your Facebook Page → Reviews → "Write a review" link.',
    popular: true,
  },
  {
    id: 'yelp',
    name: 'Yelp',
    category: 'general',
    iconUrl: `${SI}/yelp`,
    urlHint: 'Your Yelp business page URL (the page itself accepts reviews).',
    popular: true,
  },
  {
    id: 'bing',
    name: 'Bing Places',
    category: 'general',
    iconUrl: `${SI}/bing`,
    urlHint: 'Your Bing Places for Business listing URL.',
  },
  {
    id: 'apple-maps',
    name: 'Apple Maps',
    category: 'general',
    iconUrl: `${SI}/apple`,
    urlHint: 'Open Apple Maps, find your business, copy the placecard URL.',
  },
  {
    id: 'trustpilot',
    name: 'Trustpilot',
    category: 'general',
    iconUrl: `${SI}/trustpilot`,
    urlHint: 'Your Trustpilot business profile page URL.',
  },
  {
    id: 'bbb',
    name: 'Better Business Bureau',
    category: 'general',
    iconUrl: '',  // no Simple Icon — UI renders letter avatar
    urlHint: 'Your BBB Business Profile page URL.',
  },
  {
    id: 'nextdoor',
    name: 'Nextdoor',
    category: 'general',
    iconUrl: `${SI}/nextdoor`,
    urlHint: 'Your Nextdoor business page URL (recommendations section).',
  },
  {
    id: 'yellowpages',
    name: 'Yellow Pages',
    category: 'general',
    iconUrl: '',
    urlHint: 'Your YP.com business listing URL.',
  },

  // ── Restaurants / Food ───────────────────────────────────
  {
    id: 'opentable',
    name: 'OpenTable',
    category: 'restaurants',
    iconUrl: `${SI}/opentable`,
    urlHint: 'Your OpenTable restaurant page URL.',
  },
  {
    id: 'zomato',
    name: 'Zomato',
    category: 'restaurants',
    iconUrl: `${SI}/zomato`,
    urlHint: 'Your Zomato restaurant page URL.',
  },
  {
    id: 'tripadvisor',
    name: 'Tripadvisor',
    category: 'restaurants',
    iconUrl: `${SI}/tripadvisor`,
    urlHint: 'Your Tripadvisor restaurant listing URL.',
    popular: true,
  },
  {
    id: 'doordash',
    name: 'DoorDash',
    category: 'restaurants',
    iconUrl: `${SI}/doordash`,
    urlHint: 'Your DoorDash store page URL (customers can leave reviews there).',
  },
  {
    id: 'ubereats',
    name: 'Uber Eats',
    category: 'restaurants',
    iconUrl: `${SI}/ubereats`,
    urlHint: 'Your Uber Eats store page URL.',
  },
  {
    id: 'grubhub',
    name: 'Grubhub',
    category: 'restaurants',
    iconUrl: `${SI}/grubhub`,
    urlHint: 'Your Grubhub restaurant page URL.',
  },

  // ── Hotels / Travel ──────────────────────────────────────
  {
    id: 'booking',
    name: 'Booking.com',
    category: 'hotels',
    iconUrl: `${SI}/bookingdotcom`,
    urlHint: 'Your Booking.com property page URL.',
  },
  {
    id: 'agoda',
    name: 'Agoda',
    category: 'hotels',
    iconUrl: '',
    urlHint: 'Your Agoda property page URL.',
  },
  {
    id: 'airbnb',
    name: 'Airbnb',
    category: 'hotels',
    iconUrl: `${SI}/airbnb`,
    urlHint: 'Your Airbnb listing URL (guests can leave reviews there).',
  },
  {
    id: 'expedia',
    name: 'Expedia',
    category: 'hotels',
    iconUrl: `${SI}/expedia`,
    urlHint: 'Your Expedia property listing URL.',
  },
  {
    id: 'hotels-com',
    name: 'Hotels.com',
    category: 'hotels',
    iconUrl: `${SI}/hotelsdotcom`,
    urlHint: 'Your Hotels.com property page URL.',
  },

  // ── Home Services ────────────────────────────────────────
  {
    id: 'angi',
    name: 'Angi (formerly Angie\'s List)',
    category: 'home-services',
    iconUrl: `${SI}/angi`,
    urlHint: 'Your Angi business profile page URL.',
  },
  {
    id: 'homeadvisor',
    name: 'HomeAdvisor',
    category: 'home-services',
    iconUrl: '',
    urlHint: 'Your HomeAdvisor business profile URL.',
  },
  {
    id: 'thumbtack',
    name: 'Thumbtack',
    category: 'home-services',
    iconUrl: `${SI}/thumbtack`,
    urlHint: 'Your Thumbtack professional profile URL.',
  },
  {
    id: 'houzz',
    name: 'Houzz',
    category: 'home-services',
    iconUrl: `${SI}/houzz`,
    urlHint: 'Your Houzz professional profile URL.',
  },
  {
    id: 'porch',
    name: 'Porch',
    category: 'home-services',
    iconUrl: '',
    urlHint: 'Your Porch business profile URL.',
  },

  // ── Medical / Dental ─────────────────────────────────────
  {
    id: 'healthgrades',
    name: 'Healthgrades',
    category: 'medical',
    iconUrl: '',
    urlHint: 'Your Healthgrades provider profile URL.',
  },
  {
    id: 'vitals',
    name: 'Vitals',
    category: 'medical',
    iconUrl: '',
    urlHint: 'Your Vitals.com provider profile URL.',
  },
  {
    id: 'ratemds',
    name: 'RateMDs',
    category: 'medical',
    iconUrl: '',
    urlHint: 'Your RateMDs provider profile URL.',
  },
  {
    id: 'zocdoc',
    name: 'Zocdoc',
    category: 'medical',
    iconUrl: `${SI}/zocdoc`,
    urlHint: 'Your Zocdoc provider profile URL.',
  },
  {
    id: 'doctor-com',
    name: 'Doctor.com',
    category: 'medical',
    iconUrl: '',
    urlHint: 'Your Doctor.com profile URL.',
  },

  // ── Legal ───────────────────────────────────────────────
  {
    id: 'avvo',
    name: 'Avvo',
    category: 'legal',
    iconUrl: '',
    urlHint: 'Your Avvo attorney profile URL.',
  },
  {
    id: 'martindale',
    name: 'Martindale-Hubbell',
    category: 'legal',
    iconUrl: '',
    urlHint: 'Your Martindale lawyer profile URL.',
  },
  {
    id: 'lawyers-com',
    name: 'Lawyers.com',
    category: 'legal',
    iconUrl: '',
    urlHint: 'Your Lawyers.com attorney profile URL.',
  },
  {
    id: 'findlaw',
    name: 'FindLaw',
    category: 'legal',
    iconUrl: '',
    urlHint: 'Your FindLaw lawyer profile URL.',
  },

  // ── B2B / Agencies ──────────────────────────────────────
  {
    id: 'clutch',
    name: 'Clutch',
    category: 'b2b',
    iconUrl: `${SI}/clutch`,
    urlHint: 'Your Clutch.co agency profile URL.',
  },
  {
    id: 'g2',
    name: 'G2',
    category: 'b2b',
    iconUrl: `${SI}/g2`,
    urlHint: 'Your G2 product profile URL.',
  },
  {
    id: 'capterra',
    name: 'Capterra',
    category: 'b2b',
    iconUrl: `${SI}/capterra`,
    urlHint: 'Your Capterra product profile URL.',
  },
  {
    id: 'saasworthy',
    name: 'SaaSworthy',
    category: 'b2b',
    iconUrl: '',
    urlHint: 'Your SaaSworthy product profile URL.',
  },
  {
    id: 'softwareadvice',
    name: 'Software Advice',
    category: 'b2b',
    iconUrl: '',
    urlHint: 'Your Software Advice product profile URL.',
  },

  // ── Automotive ─────────────────────────────────────────
  {
    id: 'cars-com',
    name: 'Cars.com',
    category: 'automotive',
    iconUrl: `${SI}/carsdotcom`,
    urlHint: 'Your Cars.com dealership page URL.',
  },
  {
    id: 'edmunds',
    name: 'Edmunds',
    category: 'automotive',
    iconUrl: '',
    urlHint: 'Your Edmunds dealer reviews page URL.',
  },
  {
    id: 'dealer-rater',
    name: 'DealerRater',
    category: 'automotive',
    iconUrl: '',
    urlHint: 'Your DealerRater dealership profile URL.',
  },
  {
    id: 'auto-trader',
    name: 'AutoTrader',
    category: 'automotive',
    iconUrl: '',
    urlHint: 'Your AutoTrader dealer profile URL.',
  },

  // ── UK-specific (trending) ───────────────────────────────
  {
    id: 'yell',
    name: 'Yell (UK)',
    category: 'general',
    iconUrl: `${SI}/yell`,
    urlHint: 'Your Yell.com business listing URL.',
  },
  {
    id: 'trust-a-trade',
    name: 'TrustATrader (UK)',
    category: 'home-services',
    iconUrl: '',
    urlHint: 'Your TrustATrader profile URL.',
  },
  {
    id: 'checkatrade',
    name: 'Checkatrade (UK)',
    category: 'home-services',
    iconUrl: `${SI}/checkatrade`,
    urlHint: 'Your Checkatrade profile URL.',
  },
  {
    id: 'which',
    name: 'Which? Trusted Traders (UK)',
    category: 'home-services',
    iconUrl: `${SI}/which`,
    urlHint: 'Your Which? Trusted Traders profile URL.',
  },

  // ── Social / niche ──────────────────────────────────────
  {
    id: 'instagram',
    name: 'Instagram',
    category: 'general',
    iconUrl: `${SI}/instagram`,
    urlHint: 'Your Instagram profile URL (customers can mention/tag you).',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    category: 'b2b',
    iconUrl: `${SI}/linkedin`,
    urlHint: 'Your LinkedIn company page URL.',
  },
  {
    id: 'reddit',
    name: 'Reddit',
    category: 'general',
    iconUrl: `${SI}/reddit`,
    urlHint: 'Your subreddit or Reddit thread where customers can leave feedback.',
  },
  {
    id: 'producthunt',
    name: 'Product Hunt',
    category: 'b2b',
    iconUrl: `${SI}/producthunt`,
    urlHint: 'Your Product Hunt product page URL.',
  },
]

// Lookup map for O(1) access by id
export const PLATFORM_MAP: Record<string, ReviewPlatform> = Object.fromEntries(
  REVIEW_PLATFORMS.map(p => [p.id, p])
)

// Category labels for UI grouping
export const CATEGORY_LABELS: Record<PlatformCategory, string> = {
  'general': 'General',
  'restaurants': 'Restaurants & Food',
  'hotels': 'Hotels & Travel',
  'home-services': 'Home Services',
  'medical': 'Medical & Dental',
  'legal': 'Legal',
  'b2b': 'B2B & Agencies',
  'automotive': 'Automotive',
}

// Category order for display
export const CATEGORY_ORDER: PlatformCategory[] = [
  'general',
  'restaurants',
  'hotels',
  'home-services',
  'medical',
  'legal',
  'b2b',
  'automotive',
]

/**
 * Generate a URL-safe slug from a business name.
 * Used for the public /review-us/[slug] page.
 */
export function generateBusinessSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')  // remove special chars
    .replace(/\s+/g, '-')          // spaces to hyphens
    .replace(/-+/g, '-')           // collapse multiple hyphens
    .replace(/^-|-$/g, '')         // trim leading/trailing hyphens
}

/**
 * Resolve a platform's display info from a DB link row.
 * Falls back to customName/customIconUrl for custom platforms.
 */
export function resolvePlatformInfo(link: {
  platformId: string | null
  customName: string | null
  customIconUrl: string | null
}): { name: string; iconUrl: string } {
  if (link.platformId && PLATFORM_MAP[link.platformId]) {
    const platform = PLATFORM_MAP[link.platformId]
    return { name: platform.name, iconUrl: platform.iconUrl }
  }
  return {
    name: link.customName || 'Review Us',
    iconUrl: link.customIconUrl || '',
  }
}
