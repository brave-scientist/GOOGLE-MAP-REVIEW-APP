import crypto from 'crypto'
import { EncryptJWT, jwtDecrypt } from 'jose'
import { NextRequest, NextResponse } from 'next/server'
import { getRedisClient } from '@/lib/rate-limit'
import { db } from '@/lib/db'

// lib/integrations/facebook-graph.ts — Facebook Graph API integration
// Requires env vars: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET
// API docs: https://developers.facebook.com/docs/graph-api/reference/v19.0

const FB_GRAPH_BASE = 'https://graph.facebook.com/v19.0'
const FB_OAUTH_DIALOG = 'https://www.facebook.com/v19.0/dialog/oauth'

export const FB_OAUTH_STATE_COOKIE = 'rr_oauth_fb_state'
export const FB_STATE_TTL_SECONDS = 600 // 10 minutes

// In-memory single-use transaction store for fast atomic check & local/fallback execution
const consumedFBTransactions = new Map<string, number>()

// Periodic cleanup of expired in-memory consumed transaction entries
if (typeof setInterval !== 'undefined') {
  const cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, expiresAt] of consumedFBTransactions.entries()) {
      if (expiresAt < now) {
        consumedFBTransactions.delete(key)
      }
    }
  }, 5 * 60 * 1000)
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer && typeof (cleanupTimer as any).unref === 'function') {
    ;(cleanupTimer as any).unref()
  }
}

/**
 * Derives a dedicated 256-bit symmetric encryption key from SESSION_SECRET for Facebook OAuth state JWE.
 * Fails closed in production if SESSION_SECRET is missing or < 32 chars.
 */
function getFBEncryptionKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (process.env.NODE_ENV === 'production' && (!secret || secret.trim().length < 32)) {
    throw new Error('FATAL: SESSION_SECRET must be configured and at least 32 characters in production')
  }
  const keyMaterial = secret || 'reviewreply-dev-secret-change-in-production-min-32-chars'
  return crypto
    .createHash('sha256')
    .update('rr-fb-oauth-state-encryption-key-v1:' + keyMaterial)
    .digest()
}

export interface FBStatePayload {
  state: string
  businessId: string
  userId: string
  createdAt: number
  returnTo?: string
}

/**
 * Generates cryptographically secure random string with specified entropy.
 */
export function generateCryptographicEntropy(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('base64url')
}

/**
 * Encrypts and encodes temporary Facebook OAuth transaction state using JWE (AES-256-GCM).
 */
export async function encodeFBState(payload: FBStatePayload): Promise<string> {
  const encryptionKey = getFBEncryptionKey()
  return await new EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + FB_STATE_TTL_SECONDS)
    .encrypt(encryptionKey)
}

/**
 * Decrypts and verifies the temporary Facebook OAuth transaction state from JWE.
 */
export async function decodeFBState(token: string): Promise<FBStatePayload | null> {
  try {
    const encryptionKey = getFBEncryptionKey()
    const { payload } = await jwtDecrypt(token, encryptionKey)
    if (!payload.state || !payload.businessId || !payload.userId) {
      return null
    }
    return {
      state: payload.state as string,
      businessId: payload.businessId as string,
      userId: payload.userId as string,
      createdAt: (payload.createdAt as number) || (payload.iat as number) * 1000,
      returnTo: payload.returnTo as string | undefined,
    }
  } catch {
    return null
  }
}

/**
 * Atomically consumes a Facebook OAuth transaction state to enforce single-use semantics
 * and block concurrent replay race conditions.
 */
export async function consumeFBTransaction(
  state: string,
  ttlMs: number = FB_STATE_TTL_SECONDS * 1000
): Promise<boolean> {
  if (!state || typeof state !== 'string' || state.trim().length === 0) {
    return false
  }

  // 1. If Redis is configured, use atomic SET NX PX as primary fast guard
  const redis = getRedisClient()
  if (redis) {
    try {
      const res = await redis.set(`oauth:fb:consumed:${state}`, '1', {
        nx: true,
        px: ttlMs,
      })
      if (!res || (res !== 'OK' && res !== 'true')) {
        return false
      }
    } catch (err) {
      console.warn('[Facebook OAuth] Redis consume error, relying on database check:', err)
    }
  }

  // 2. Persistent database atomic single-use consumption (distributed across all serverless instances)
  try {
    if (db?.oAuthTransactionState) {
      const updated = await db.oAuthTransactionState.updateMany({
        where: {
          state,
          provider: 'facebook',
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: {
          consumedAt: new Date(),
        },
      })

      if (updated.count === 1) {
        return true
      }

      // If state record exists but was not updated, it is already consumed or expired
      const existing = await db.oAuthTransactionState.findUnique({
        where: { state },
        select: { id: true, consumedAt: true, expiresAt: true },
      })

      if (existing) {
        return false
      }
    }
  } catch (dbErr) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[Facebook OAuth] Database state consumption error in production:', dbErr)
      return false
    }
  }

  // 3. In-memory check for non-database unit tests / local mock environments
  const now = Date.now()
  const existingExpiresAt = consumedFBTransactions.get(state)
  if (existingExpiresAt && existingExpiresAt > now) {
    return false
  }

  consumedFBTransactions.set(state, now + ttlMs)
  return true
}

/**
 * Clears in-memory consumed Facebook transactions (for testing purposes).
 */
export function _clearConsumedFBTransactions(): void {
  consumedFBTransactions.clear()
}

function shouldUseSecureCookie(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_APP_URL?.startsWith('https') === true
}

/**
 * Sets the secure, encrypted Facebook OAuth state cookie on a response.
 */
export async function setFBStateCookie(response: NextResponse, payload: FBStatePayload) {
  const token = await encodeFBState(payload)
  response.cookies.set(FB_OAUTH_STATE_COOKIE, token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    maxAge: FB_STATE_TTL_SECONDS,
    path: '/',
  })
}

/**
 * Clears the Facebook OAuth state cookie.
 */
export function clearFBStateCookie(response: NextResponse) {
  response.cookies.set(FB_OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}

/**
 * Reads and decodes the Facebook OAuth state cookie from an incoming request.
 */
export async function getFBStateFromRequest(request: NextRequest): Promise<FBStatePayload | null> {
  const token = request.cookies.get(FB_OAUTH_STATE_COOKIE)?.value
  if (!token) return null
  return await decodeFBState(token)
}

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
 */
export async function postFacebookReply(
  pageAccessToken: string,
  openGraphStoryId: string,
  message: string
): Promise<{ ok: boolean; status?: number; error?: string; remoteId?: string }> {
  try {
    const response = await fetch(`${FB_GRAPH_BASE}/${openGraphStoryId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: pageAccessToken,
        message,
      }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.error) {
      const errorMessage = data.error?.message || `Facebook Graph API error ${response.status}`
      console.error('Failed to post Facebook reply:', errorMessage)
      return {
        ok: false,
        status: response.status,
        error: errorMessage,
      }
    }

    return {
      ok: true,
      status: response.status,
      remoteId: (data.id as string) || openGraphStoryId,
    }
  } catch (err: any) {
    return {
      ok: false,
      error: err.message || 'Network error posting Facebook reply',
    }
  }
}
