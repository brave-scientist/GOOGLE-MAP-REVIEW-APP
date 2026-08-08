// lib/integrations/google-business-profile.ts — Google Business Profile API integration
// Requires env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// API docs: https://developers.google.com/my-business/reference/rest

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GBP_API_BASE = 'https://mybusiness.googleapis.com/v4'

export interface GoogleTokens {
  access_token: string
  refresh_token: string
  expires_at: number // Unix timestamp
}

export interface GoogleReview {
  reviewId: string
  reviewer: {
    displayName: string
    profilePhotoUrl?: string
  }
  starRating: string // 'ONE' through 'FIVE'
  comment?: string
  createTime: string
  reviewReply?: {
    comment: string
    updateTime: string
  }
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<GoogleTokens | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env')
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(`Token exchange failed: ${data.error || data.error_description}`)
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in * 1000),
  }
}

// Refresh an expired access token
export async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_at: number } | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) return null

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })

  const data = await response.json()
  if (!response.ok) return null

  return {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in * 1000),
  }
}

// Get the Google OAuth consent URL
export function getGoogleAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const scopes = [
    'https://www.googleapis.com/auth/business.manage',
  ].join(' ')

  const params = new URLSearchParams({
    client_id: clientId || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

// Fetch reviews from Google Business Profile
export async function fetchGoogleReviews(accessToken: string, accountName: string, locationName: string): Promise<GoogleReview[]> {
  const url = `${GBP_API_BASE}/${accountName}/locations/${locationName}/reviews`
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Google API error: ${response.status} ${error}`)
  }

  const data = await response.json()
  return data.reviews || []
}

// Post a reply to a Google review
export async function postGoogleReply(accessToken: string, reviewName: string, comment: string): Promise<boolean> {
  const url = `${GBP_API_BASE}/${reviewName}/reply`
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ comment }),
  })

  return response.ok
}

// Convert Google star rating to integer
export function googleStarRatingToInt(rating: string): number {
  const map: Record<string, number> = {
    'ONE': 1,
    'TWO': 2,
    'THREE': 3,
    'FOUR': 4,
    'FIVE': 5,
  }
  return map[rating] || 0
}

export function isGoogleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}
