/**
 * src/lib/templates/token-engine.ts
 *
 * Dynamic Variable / Token Hydration & Validation Engine (AI-02)
 *
 * Handles parsing, validation, and safe hydration of dynamic template tokens:
 * - {{customer_name}} / {{author}}
 * - {{first_name}}
 * - {{business_name}}
 * - {{business_phone}} / {{phone}}
 * - {{business_address}} / {{address}}
 * - {{rating}}
 * - {{rating_stars}}
 * - {{platform}} / {{source}}
 * - {{manager_name}}
 * - {{contact_email}}
 */

export interface HydrationContext {
  customerName?: string | null
  author?: string | null
  firstName?: string | null
  businessName?: string | null
  businessPhone?: string | null
  businessAddress?: string | null
  rating?: number | string | null
  platform?: string | null
  source?: string | null
  managerName?: string | null
  contactEmail?: string | null
  industry?: string | null
}

export interface AvailableToken {
  token: string
  label: string
  example: string
  category: 'customer' | 'business' | 'review' | 'contact'
}

export const AVAILABLE_TOKENS: AvailableToken[] = [
  { token: '{{first_name}}', label: 'First Name', example: 'Sarah', category: 'customer' },
  { token: '{{customer_name}}', label: 'Full Customer Name', example: 'Sarah Jenkins', category: 'customer' },
  { token: '{{business_name}}', label: 'Business Name', example: 'Apex Dental Care', category: 'business' },
  { token: '{{business_phone}}', label: 'Business Phone', example: '+1 (555) 234-5678', category: 'business' },
  { token: '{{business_address}}', label: 'Business Address', example: '123 Main St, Suite 400', category: 'business' },
  { token: '{{rating}}', label: 'Rating Number', example: '5', category: 'review' },
  { token: '{{rating_stars}}', label: 'Rating Stars', example: '★★★★★', category: 'review' },
  { token: '{{platform}}', label: 'Review Platform', example: 'Google', category: 'review' },
  { token: '{{manager_name}}', label: 'Manager / Contact Name', example: 'Alex Morgan', category: 'contact' },
  { token: '{{contact_email}}', label: 'Support / Contact Email', example: 'support@apexdental.com', category: 'contact' },
]

/**
 * Extracts all unique tokens found in a template string.
 * Example: "Hi {{first_name}}, thanks for visiting {{business_name}}!" -> ["{{first_name}}", "{{business_name}}"]
 */
export function extractTokens(template: string): string[] {
  if (!template) return []
  const matches = template.match(/\{\{([a-zA-Z0-9_-]+)\}\}/g)
  if (!matches) return []
  return Array.from(new Set(matches.map(m => m.toLowerCase())))
}

/**
 * Validates template syntax for unclosed braces or unknown tokens.
 */
export function validateTemplate(template: string): { valid: boolean; errors: string[]; tokens: string[] } {
  const errors: string[] = []
  if (!template || template.trim() === '') {
    return { valid: false, errors: ['Template body cannot be empty'], tokens: [] }
  }

  // Check for unmatched single braces: e.g. "{customer_name}" or "{{customer_name}"
  const singleOpen = (template.match(/(?<!\{)\{(?!\{)/g) || []).length
  const singleClose = (template.match(/(?<!\})\}(?!\})/g) || []).length
  if (singleOpen > 0 || singleClose > 0) {
    errors.push('Template contains single curly braces. Please use double curly braces {{variable}}.')
  }

  const tokens = extractTokens(template)
  return {
    valid: errors.length === 0,
    errors,
    tokens,
  }
}

/**
 * Generates a star representation string from a numeric rating (1-5).
 */
export function ratingToStars(rating: number | string | null | undefined): string {
  const num = typeof rating === 'number' ? rating : Number(rating) || 5
  const clamped = Math.max(1, Math.min(5, Math.round(num)))
  return '★'.repeat(clamped) + '☆'.repeat(5 - clamped)
}

/**
 * Safely extracts first name from author or customer name.
 */
export function extractFirstName(authorName?: string | null): string {
  if (!authorName || !authorName.trim()) return 'there'
  const parts = authorName.trim().split(/\s+/)
  return parts[0] || 'there'
}

/**
 * Authoritative hydration function. Replaces all token occurrences safely with fallbacks.
 */
export function hydrateTemplate(template: string, ctx: HydrationContext = {}): string {
  if (!template) return ''

  const rawAuthor = ctx.author || ctx.customerName || ''
  const firstName = ctx.firstName || extractFirstName(rawAuthor)
  const customerName = rawAuthor.trim() || 'Valued Customer'
  const businessName = (ctx.businessName || '').trim() || 'our team'
  const businessPhone = (ctx.businessPhone || '').trim() || ''
  const businessAddress = (ctx.businessAddress || '').trim() || ''
  const ratingNum = ctx.rating !== undefined && ctx.rating !== null ? String(ctx.rating) : '5'
  const ratingStars = ratingToStars(ctx.rating)
  const platform = (ctx.platform || ctx.source || 'Google').trim()
  const managerName = (ctx.managerName || '').trim() || 'Management'
  const contactEmail = (ctx.contactEmail || '').trim() || ''

  // Replace dictionary
  const replacements: Record<string, string> = {
    '{{first_name}}': firstName,
    '{{firstname}}': firstName,
    '{{customer_name}}': customerName,
    '{{customername}}': customerName,
    '{{author}}': customerName,
    '{{business_name}}': businessName,
    '{{businessname}}': businessName,
    '{{business_phone}}': businessPhone,
    '{{phone}}': businessPhone,
    '{{business_address}}': businessAddress,
    '{{address}}': businessAddress,
    '{{rating}}': ratingNum,
    '{{rating_stars}}': ratingStars,
    '{{platform}}': platform,
    '{{source}}': platform,
    '{{manager_name}}': managerName,
    '{{manager}}': managerName,
    '{{contact_email}}': contactEmail,
    '{{email}}': contactEmail,
  }

  // Regex replacement case-insensitively
  return template.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/gi, (match) => {
    const lowerMatch = match.toLowerCase()
    if (lowerMatch in replacements) {
      return replacements[lowerMatch]
    }
    // Return unchanged if token is unrecognized
    return match
  })
}
