// lib/integrations/facebook-graph.ts — Facebook Graph API integration
// Requires env vars: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET
// API docs: https://developers.facebook.com/docs/graph-api/reference/v19.0
//
// Flow overview:
//   1. User clicks "Connect Facebook" → redirect to Facebook OAuth consent
//   2. Facebook redirects back with ?code=... → exchange for user access_token
//   3. Use user access_token to GET /me/accounts → list of Pages the user manages
//   4. User selects which Page to connect (or auto-select if only one)
//   5. Store the Page's page_access_token (long-lived) in OAuthToken table
//   6. Sync reviews: GET /{page-id}/ratings → reviews with rating, text, reviewer
//
// Required Facebook App permissions (App Review required for production):
//   - pages_manage_metadata  (read Page info)
//   - pages_read_engagement  (read reviews/ratings)
//   - pages_manage_engagement (post replies — for future reply feature)

const FB_GRAPH_BASE = 'https://graph.facebook.com/v19.0'
const FB_OAUTH_DIALOG = 'https://www.facebook.com/v19.0/dialog/oauth'

export interface FacebookTokens {
  access_token: string      // user access token (short-lived, ~1-2 hours)
  expires_in: number        // seconds until expiry
  token_type: string
}

export interface FacebookLongLivedToken {
  access_token: string      // long-lived user token (~60 days)
  expires_at: number        // Unix timestamp (ms)
  token_type: string
}

export interface FacebookPage {
  id: string
  name: string
  access_token: string      // page access token (long-lived, doesn't expire unless revoked)
  category: string
  tasks: string[]           // permissions the user has on this page
}

export interface FacebookReview {
  id: string                // review ID (e.g. "123456_789012")
  rating: number            // 1-5
  review_text?: string
  reviewer: {
    id: string
    name: string
  }
  created_time: string      // ISO 8601
  open_graph_story?: string // story ID for replies
}

/**
 * Returns true if Facebook OAuth env vars are configured.
 */
export function isFacebookConfigured(): boolean {
  return !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET)
}

/**
 * Get the Facebook OAuth consent URL.
 * Scopes: pages_manage_metadata, pages_read_engagement, pages_manage_engagement
 */
export function getFacebookAuthUrl(redirectUri: string, state: string): string {
  const appId = process.env.FACEBOOK_APP_ID
  const scopes = [
    'pages_manage_metadata',
    'pages_read_engagement',
    'pages_manage_engagement',
  ].join(',')

  const params = new URLSearchParams({
    client_id: appId || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    state,
  })

  return `${FB_OAUTH_DIALOG}?${params.toString()}`
}

/**
 * Exchange the authorization code for a short-lived user access token.
 */
export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<FacebookTokens | null> {
  const appId = process.env.FACEBOOK_APP_ID
  const appSecret = process.env.FACEBOOK_APP_SECRET

  if (!appId || !appSecret) {
    throw new Error('Facebook OAuth not configured. Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in .env')
  }

  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  })

  const response = await fetch(`${FB_GRAPH_BASE}/oauth/access_token?${params.toString()}`)
  const data = await response.json()

  if (!response.ok || data.error) {
    throw new Error(`Facebook token exchange failed: ${data.error?.message || data.error || response.status}`)
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 0,
    token_type: data.token_type || 'bearer',
  }
}

/**
 * Exchange a short-lived user token for a long-lived user token (~60 days).
 * Page access tokens obtained from a long-lived user token are also long-lived
 * and don't expire unless the user revokes access.
 */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<FacebookLongLivedToken | null> {
  const appId = process.env.FACEBOOK_APP_ID
  const appSecret = process.env.FACEBOOK_APP_SECRET

  if (!appId || !appSecret) return null

  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  })

  const response = await fetch(`${FB_GRAPH_BASE}/oauth/access_token?${params.toString()}`)
  const data = await response.json()

  if (!response.ok || data.error) {
    console.error('Facebook long-lived token exchange failed:', data.error)
    return null
  }

  return {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in * 1000),
    token_type: data.token_type || 'bearer',
  }
}

/**
 * List Facebook Pages the user manages.
 * Returns page access tokens that can be stored for long-term API access.
 */
export async function listFacebookPages(userAccessToken: string): Promise<FacebookPage[]> {
  const params = new URLSearchParams({
    access_token: userAccessToken,
    fields: 'id,name,access_token,category,tasks',
  })

  const response = await fetch(`${FB_GRAPH_BASE}/me/accounts?${params.toString()}`)
  const data = await response.json()

  if (!response.ok || data.error) {
    throw new Error(`Failed to list Facebook Pages: ${data.error?.message || data.error || response.status}`)
  }

  return (data.data || []).map((page: {
    id: string
    name: string
    access_token: string
    category: string
    tasks?: string[]
  }) => ({
    id: page.id,
    name: page.name,
    access_token: page.access_token,
    category: page.category,
    tasks: page.tasks || [],
  }))
}

/**
 * Fetch reviews/ratings for a Facebook Page.
 * Requires the page access token (from listFacebookPages).
 *
 * Facebook returns reviews via the /ratings edge, which requires
 * pages_read_engagement permission.
 */
export async function fetchFacebookReviews(
  pageId: string,
  pageAccessToken: string,
  limit = 50
): Promise<FacebookReview[]> {
  const params = new URLSearchParams({
    access_token: pageAccessToken,
    fields: 'id,rating,review_text,reviewer,created_time,open_graph_story',
    limit: String(Math.min(100, Math.max(1, limit))),
  })

  const response = await fetch(`${FB_GRAPH_BASE}/${pageId}/ratings?${params.toString()}`)
  const data = await response.json()

  if (!response.ok || data.error) {
    throw new Error(`Failed to fetch Facebook reviews: ${data.error?.message || data.error || response.status}`)
  }

  return (data.data || []).map((r: {
    id: string
    rating: number
    review_text?: string
    reviewer?: { id: string; name: string }
    created_time: string
    open_graph_story?: string
  }) => ({
    id: r.id,
    rating: r.rating,
    review_text: r.review_text,
    reviewer: {
      id: r.reviewer?.id || 'unknown',
      name: r.reviewer?.name || 'Anonymous',
    },
    created_time: r.created_time,
    open_graph_story: r.open_graph_story,
  }))
}

/**
 * Post a reply to a Facebook review (via the comment endpoint on the
 * open_graph_story). Requires pages_manage_engagement permission.
 *
 * NOTE: Facebook's API for replying to reviews has been inconsistent across
 * API versions. The open_graph_story comment endpoint is the documented way,
 * but may require additional review. This is scaffolded for future use.
 */
export async function postFacebookReply(
  pageAccessToken: string,
  openGraphStoryId: string,
  message: string
): Promise<boolean> {
  const response = await fetch(`${FB_GRAPH_BASE}/${openGraphStoryId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: pageAccessToken,
      message,
    }),
  })

  const data = await response.json()
  if (!response.ok || data.error) {
    console.error('Failed to post Facebook reply:', data.error)
    return false
  }
  return true
}
