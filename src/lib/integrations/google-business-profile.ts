import crypto from 'crypto'
import { EncryptJWT, jwtDecrypt } from 'jose'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/crypto'
import { updateAccessToken } from '@/lib/oauth-store'
import { getRedisClient } from '@/lib/rate-limit'

// lib/integrations/google-business-profile.ts — Google Business Profile API integration
// Requires env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// API docs: https://developers.google.com/my-business/reference/rest

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const GBP_API_BASE = 'https://mybusiness.googleapis.com/v4'

export const GBP_OAUTH_STATE_COOKIE = 'rr_oauth_gbp_state'
export const GBP_STATE_TTL_SECONDS = 600 // 10 minutes

// In-memory single-use transaction store for fast atomic check & local/fallback execution
const consumedGBPTransactions = new Map<string, number>()

// Periodic cleanup of expired in-memory consumed transaction entries
if (typeof setInterval !== 'undefined') {
  const cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, expiresAt] of consumedGBPTransactions.entries()) {
      if (expiresAt < now) {
        consumedGBPTransactions.delete(key)
      }
    }
  }, 5 * 60 * 1000)
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer && typeof (cleanupTimer as any).unref === 'function') {
    ;(cleanupTimer as any).unref()
  }
}

/**
 * Derives a dedicated 256-bit symmetric encryption key from SESSION_SECRET for GBP OAuth state JWE.
 * Fails closed in production if SESSION_SECRET is missing or < 32 chars.
 */
let ephemeralDevSecret: string | null = null

function getGBPEncryptionKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (process.env.NODE_ENV === 'production' && (!secret || secret.trim().length < 32)) {
    throw new Error('FATAL: SESSION_SECRET must be configured and at least 32 characters in production')
  }
  if (!secret) {
    if (!ephemeralDevSecret) {
      ephemeralDevSecret = crypto.randomBytes(32).toString('hex')
    }
  }
  const keyMaterial = secret || ephemeralDevSecret!
  return crypto
    .createHash('sha256')
    .update('rr-gbp-oauth-state-encryption-key-v1:' + keyMaterial)
    .digest()
}

export interface GBPStatePayload {
  state: string
  codeVerifier: string
  businessId: string
  userId: string
  createdAt: number
  returnTo?: string
}

export interface GoogleTokens {
  access_token: string
  refresh_token: string
  expires_at: number // Unix timestamp
}

export interface GoogleReview {
  name?: string
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

export type TokenResolutionResult =
  | { success: true; accessToken: string }
  | {
      success: false
      code: 'NO_OAUTH_TOKEN' | 'GOOGLE_REAUTH_REQUIRED' | 'TOKEN_DECRYPT_FAILED' | 'GOOGLE_API_ERROR'
      error: string
    }

/**
 * Generates cryptographically secure random string with specified entropy.
 */
export function generateCryptographicEntropy(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('base64url')
}

/**
 * Generates PKCE verifier and S256 code challenge (RFC 7636).
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string; codeChallengeMethod: 'S256' } {
  // 32 bytes base64url = 43 chars (RFC 7636 requires 43-128 chars)
  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  }
}

/**
 * Validates a PKCE challenge against a verifier.
 */
export function verifyPKCEChallenge(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false
  const derived = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url')
  const derivedBuf = Buffer.from(derived)
  const challengeBuf = Buffer.from(challenge)
  if (derivedBuf.length !== challengeBuf.length) {
    return false
  }
  return crypto.timingSafeEqual(derivedBuf, challengeBuf)
}

/**
 * Encrypts and encodes temporary GBP OAuth transaction state using JWE (AES-256-GCM).
 */
export async function encodeGBPState(payload: GBPStatePayload): Promise<string> {
  const encryptionKey = getGBPEncryptionKey()
  return await new EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + GBP_STATE_TTL_SECONDS)
    .encrypt(encryptionKey)
}

/**
 * Decrypts and verifies the temporary GBP OAuth transaction state from JWE.
 */
export async function decodeGBPState(token: string): Promise<GBPStatePayload | null> {
  try {
    const encryptionKey = getGBPEncryptionKey()
    const { payload } = await jwtDecrypt(token, encryptionKey)
    if (!payload.state || !payload.codeVerifier || !payload.businessId || !payload.userId) {
      return null
    }
    return {
      state: payload.state as string,
      codeVerifier: payload.codeVerifier as string,
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
 * Atomically consumes a GBP OAuth transaction state to enforce single-use semantics
 * and block concurrent replay race conditions.
 */
export async function consumeGBPTransaction(
  state: string,
  ttlMs: number = GBP_STATE_TTL_SECONDS * 1000
): Promise<boolean> {
  if (!state || typeof state !== 'string' || state.trim().length === 0) {
    return false
  }

  // 1. Try Redis atomic SET NX PX if Redis is configured
  const redis = getRedisClient()
  if (redis) {
    try {
      const res = await redis.set(`oauth:gbp:consumed:${state}`, '1', {
        nx: true,
        px: ttlMs,
      })
      if (!res || (res !== 'OK' && res !== 'true')) {
        return false
      }
      return true
    } catch (err) {
      console.warn('[GBP OAuth] Redis consume error, falling back to in-memory store:', err)
    }
  }

  // 2. In-memory atomic single-use check
  const now = Date.now()
  const existingExpiresAt = consumedGBPTransactions.get(state)
  if (existingExpiresAt && existingExpiresAt > now) {
    return false
  }

  consumedGBPTransactions.set(state, now + ttlMs)
  return true
}

/**
 * Clears in-memory consumed GBP transactions (for testing purposes).
 */
export function _clearConsumedGBPTransactions(): void {
  consumedGBPTransactions.clear()
}

function shouldUseSecureCookie(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_APP_URL?.startsWith('https') === true
}

/**
 * Sets the secure, encrypted GBP OAuth state cookie on a response.
 */
export async function setGBPStateCookie(response: NextResponse, payload: GBPStatePayload) {
  const token = await encodeGBPState(payload)
  response.cookies.set(GBP_OAUTH_STATE_COOKIE, token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    maxAge: GBP_STATE_TTL_SECONDS,
    path: '/',
  })
}

/**
 * Clears the GBP OAuth state cookie.
 */
export function clearGBPStateCookie(response: NextResponse) {
  response.cookies.set(GBP_OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}

/**
 * Reads and decodes the GBP OAuth state cookie from an incoming request.
 */
export async function getGBPStateFromRequest(request: NextRequest): Promise<GBPStatePayload | null> {
  const token = request.cookies.get(GBP_OAUTH_STATE_COOKIE)?.value
  if (!token) return null
  return await decodeGBPState(token)
}

// Exchange authorization code for tokens (supports PKCE code_verifier)
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  codeVerifier?: string
): Promise<GoogleTokens | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env')
  }

  const bodyParams: Record<string, string> = {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  }

  if (codeVerifier) {
    bodyParams.code_verifier = codeVerifier
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(bodyParams),
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

  try {
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
  } catch {
    return null
  }
}

// Attempt remote token revocation at Google (fails gracefully without throwing)
export async function revokeGoogleToken(token: string): Promise<boolean> {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return false
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)

    const response = await fetch(
      `${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token.trim())}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: controller.signal,
      }
    )

    clearTimeout(timeout)
    return response.ok
  } catch {
    // Failure to remotely revoke must not throw or block local cleanup
    return false
  }
}

/**
 * Resolves a valid access token for a business, checking expiration and refreshing automatically.
 */
export async function getValidGoogleAccessToken(businessId: string): Promise<TokenResolutionResult> {
  const token = await db.oAuthToken.findUnique({
    where: {
      businessId_provider: {
        businessId,
        provider: 'google',
      },
    },
  })

  if (!token) {
    return {
      success: false,
      code: 'NO_OAUTH_TOKEN',
      error: 'Google account not connected for this location. Please connect your Google Business Profile in Settings → Integrations.',
    }
  }

  let accessToken: string
  try {
    accessToken = decrypt(token.accessTokenEnc)
  } catch {
    return {
      success: false,
      code: 'TOKEN_DECRYPT_FAILED',
      error: 'OAuth credential error: failed to decrypt access token. Please reconnect your Google account.',
    }
  }

  // Token expiration check with 5-minute safety margin
  const now = Date.now()
  const expiresAtMs = token.expiresAt ? token.expiresAt.getTime() : 0
  const isExpiringSoon = !token.expiresAt || expiresAtMs - now < 5 * 60 * 1000

  if (!isExpiringSoon && accessToken) {
    return {
      success: true,
      accessToken,
    }
  }

  // Token is expired or expiring soon — attempt refresh using refresh token
  let refreshToken: string
  try {
    refreshToken = decrypt(token.refreshTokenEnc)
  } catch {
    return {
      success: false,
      code: 'GOOGLE_REAUTH_REQUIRED',
      error: 'Failed to decrypt refresh token. Please reconnect your Google account in Settings.',
    }
  }

  if (!refreshToken || refreshToken.trim().length === 0) {
    return {
      success: false,
      code: 'GOOGLE_REAUTH_REQUIRED',
      error: 'Google refresh token missing. Please reconnect your Google account with offline permissions in Settings.',
    }
  }

  const refreshed = await refreshAccessToken(refreshToken)
  if (!refreshed || !refreshed.access_token) {
    return {
      success: false,
      code: 'GOOGLE_REAUTH_REQUIRED',
      error: 'Google token refresh failed. Your session may have expired or was revoked. Please reconnect Google in Settings.',
    }
  }

  // Update stored token with newly encrypted access token and updated expiry
  await updateAccessToken(
    businessId,
    'google',
    refreshed.access_token,
    new Date(refreshed.expires_at)
  )

  return {
    success: true,
    accessToken: refreshed.access_token,
  }
}

/**
 * Checks whether a business has a valid, usable Google connection.
 * Distinguishes merely having an OAuthToken record from having a decryptable,
 * non-revoked, and refreshable credential set.
 */
export async function isGoogleConnectionUsable(businessId: string): Promise<boolean> {
  try {
    const res = await getValidGoogleAccessToken(businessId)
    return res.success === true
  } catch {
    return false
  }
}

// Get the Google OAuth consent URL (supports object params or legacy redirectUri + state signature)
export function getGoogleAuthUrl(
  paramsOrRedirectUri: string | { redirectUri: string; state: string; codeChallenge?: string },
  legacyState?: string
): string {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const scopes = [
    'https://www.googleapis.com/auth/business.manage',
  ].join(' ')

  let redirectUri: string
  let state: string
  let codeChallenge: string | undefined

  if (typeof paramsOrRedirectUri === 'object') {
    redirectUri = paramsOrRedirectUri.redirectUri
    state = paramsOrRedirectUri.state
    codeChallenge = paramsOrRedirectUri.codeChallenge
  } else {
    redirectUri = paramsOrRedirectUri
    state = legacyState || ''
  }

  const params = new URLSearchParams({
    client_id: clientId || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  if (codeChallenge) {
    params.set('code_challenge', codeChallenge)
    params.set('code_challenge_method', 'S256')
  }

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export interface GoogleAccount {
  id: string
  name: string
  accountName: string
  type?: string
}

export interface GoogleLocation {
  id: string
  name: string
  title: string
  address?: string
  placeId?: string
  accountName?: string
}

export class GoogleApiError extends Error {
  public statusCode: number
  public code: string
  public originalMessage: string
  public subcode?: string
  public projectNumber?: string
  public serviceName?: string
  public activationUrl?: string

  constructor(
    message: string,
    statusCode: number,
    code: string,
    originalMessage?: string,
    subcode?: string,
    metadata?: { projectNumber?: string; serviceName?: string; activationUrl?: string }
  ) {
    super(message)
    this.name = 'GoogleApiError'
    this.statusCode = statusCode
    this.code = code
    this.originalMessage = originalMessage || message
    this.subcode = subcode
    this.projectNumber = metadata?.projectNumber
    this.serviceName = metadata?.serviceName
    this.activationUrl = metadata?.activationUrl
  }
}

/**
 * Extracts Google Cloud Project number, service name, activation/access URL,
 * and zero-quota / basic-access-required indicator from Google error payloads.
 */
export function parseGoogleApiErrorDetails(googleMsg: string, errorData: any, defaultService: string) {
  let projectNumber: string | undefined
  let serviceName: string = defaultService
  let activationUrl: string | undefined
  let isZeroQuota = false

  const details = Array.isArray(errorData?.error?.details) ? errorData.error.details : []
  for (const d of details) {
    if (d?.metadata?.consumer && typeof d.metadata.consumer === 'string') {
      projectNumber = d.metadata.consumer.replace(/^projects\//, '')
    }
    if (d?.metadata?.service && typeof d.metadata.service === 'string') {
      serviceName = d.metadata.service
    }
    if (d?.metadata?.quota_limit_value === '0' || d?.metadata?.quota_limit_value === 0) {
      isZeroQuota = true
    }
    if (Array.isArray(d?.violations)) {
      for (const v of d.violations) {
        if (typeof v?.subject === 'string' && !projectNumber) {
          const m = v.subject.match(/project[:/]([0-9a-zA-Z_-]+)/i)
          if (m) projectNumber = m[1]
        }
        if (typeof v?.description === 'string') {
          const desc = v.description.toLowerCase()
          if (desc.includes('limit is 0') || desc.includes('limit 0') || desc.includes('quota is 0')) {
            isZeroQuota = true
          }
        }
      }
    }
  }

  if (!projectNumber) {
    const projMatch = googleMsg.match(/project(?:_number)?[:\s]+([0-9a-zA-Z_-]+)/i)
    if (projMatch) {
      projectNumber = projMatch[1]
    }
  }

  const msgLower = (googleMsg || '').toLowerCase()
  if (
    msgLower.includes('limit is 0') ||
    msgLower.includes('limit of 0') ||
    msgLower.includes('limit: 0') ||
    msgLower.includes("limit '0'")
  ) {
    isZeroQuota = true
  }

  const urlMatch = googleMsg.match(/https:\/\/(?:console\.developers\.google\.com|console\.cloud\.google\.com)\/[^\s]+/i)
  if (urlMatch) {
    activationUrl = urlMatch[0].replace(/[.,]+$/, '')
  } else if (projectNumber) {
    activationUrl = `https://console.cloud.google.com/apis/library/${serviceName}?project=${projectNumber}`
  }

  return { projectNumber, serviceName, activationUrl, isZeroQuota }
}

const parseGoogleServiceDisabledDetails = parseGoogleApiErrorDetails

/**
 * Lists accounts associated with the authenticated Google user.
 * Queries Google My Business Account Management API v1, with v4 fallback on 404.
 * Never silently swallows auth, permission, or quota errors.
 */
export async function listGoogleAccounts(accessToken: string): Promise<GoogleAccount[]> {
  const allAccounts: GoogleAccount[] = []
  let pageToken: string | undefined
  let pages = 0
  const maxPages = 5

  while (pages < maxPages) {
    const url = pageToken
      ? `https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageToken=${encodeURIComponent(pageToken)}`
      : 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts'

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    if (response.ok) {
      const data = await response.json()
      const rawAccounts = Array.isArray(data?.accounts) ? data.accounts : []
      for (const acc of rawAccounts) {
        allAccounts.push({
          id: acc.name || `accounts/${acc.accountNumber || acc.name}`,
          name: acc.name || '',
          accountName: acc.accountName || acc.name || 'Personal Account',
          type: acc.type || 'PERSONAL',
        })
      }

      const nextToken = typeof data?.nextPageToken === 'string' ? data.nextPageToken.trim() : ''
      if (!nextToken || nextToken === pageToken || rawAccounts.length === 0) break
      pageToken = nextToken
      pages++
    } else {
      let errorData: any = null
      try {
        errorData = await response.json()
      } catch {}
      const googleMsg = errorData?.error?.message || response.statusText || 'Google API error'

      // Check fallback to legacy v4 endpoint on 404 or 403 (e.g. if v1 Account Management is unavailable or disabled)
      if ((response.status === 404 || response.status === 403) && pages === 0) {
        try {
          const fallbackRes = await fetch(`${GBP_API_BASE}/accounts`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          })
          if (fallbackRes.ok) {
            const data = await fallbackRes.json()
            const rawAccounts = Array.isArray(data?.accounts) ? data.accounts : []
            if (rawAccounts.length > 0) {
              return rawAccounts.map((acc: any) => ({
                id: acc.name || `accounts/${acc.accountNumber || acc.name}`,
                name: acc.name || '',
                accountName: acc.accountName || acc.name || 'Personal Account',
                type: acc.type || 'PERSONAL',
              }))
            }
          }
        } catch {}
      }

      if (response.status === 401) {
        throw new GoogleApiError(
          'Google session expired or invalid. Please re-authenticate your Google account.',
          401,
          'GOOGLE_REAUTH_REQUIRED',
          googleMsg
        )
      }
      if (response.status === 403) {
        const isServiceDisabled =
          googleMsg.toLowerCase().includes('disabled') ||
          googleMsg.toLowerCase().includes('has not been used in project') ||
          errorData?.error?.details?.some((d: any) => d.reason === 'SERVICE_DISABLED')
        const isScopeInsufficient =
          googleMsg.toLowerCase().includes('insufficient') ||
          errorData?.error?.details?.some((d: any) => d.reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')

        const subcode = isServiceDisabled
          ? 'GOOGLE_API_DISABLED'
          : isScopeInsufficient
            ? 'GOOGLE_SCOPE_INSUFFICIENT'
            : 'GOOGLE_PERMISSION_DENIED'

        const { projectNumber, serviceName, activationUrl } = parseGoogleApiErrorDetails(
          googleMsg,
          errorData,
          'mybusinessaccountmanagement.googleapis.com'
        )

        const projectHint = projectNumber ? ` (Google Cloud Project: ${projectNumber})` : ''
        const urlHint = activationUrl ? ` Enable it here: ${activationUrl}` : ''
        const message = isServiceDisabled
          ? `Google Business Profile API is disabled in your Google Cloud project${projectHint}. The required Google Cloud APIs are disabled. Please enable "My Business Account Management API" and "My Business Business Information API" in the Google Cloud Console.${urlHint}`
          : isScopeInsufficient
            ? 'Google authorization lacks required permissions (missing required permissions). Please reconnect your Google account and grant all requested scopes.'
            : 'Google Business Profile permission denied. Please verify your Google account has permissions to manage this business and the required Google Cloud APIs are enabled.'

        throw new GoogleApiError(
          message,
          403,
          'GOOGLE_PERMISSION_DENIED',
          googleMsg,
          subcode,
          { projectNumber, serviceName, activationUrl }
        )
      }
      if (response.status === 429) {
        const { projectNumber, serviceName, isZeroQuota } = parseGoogleApiErrorDetails(
          googleMsg,
          errorData,
          'mybusinessaccountmanagement.googleapis.com'
        )

        const subcode = isZeroQuota ? 'GOOGLE_ZERO_QUOTA' : 'GOOGLE_RATE_LIMITED'
        const projectHint = projectNumber ? ` (Google Cloud Project: ${projectNumber})` : ''
        const accessUrl = 'https://developers.google.com/my-business/content/get-started#request-access'

        const message = isZeroQuota
          ? `Google Business Profile API access has 0 quota in your Google Cloud project${projectHint}. Google Business Profile APIs require approval for Basic API Access before queries are permitted. Please submit an Application for Basic API Access to request quota.`
          : 'Google API rate limit reached. Please wait a few moments before retrying.'

        throw new GoogleApiError(
          message,
          429,
          'GOOGLE_QUOTA_EXCEEDED',
          googleMsg,
          subcode,
          {
            projectNumber,
            serviceName,
            activationUrl: isZeroQuota ? accessUrl : undefined,
          }
        )
      }

      throw new GoogleApiError(
        `Google API returned error status ${response.status}: ${googleMsg}`,
        response.status >= 500 ? 502 : response.status,
        'GOOGLE_API_ERROR',
        googleMsg
      )
    }
  }


  return allAccounts
}

/**
 * Formats a Google storefrontAddress or address object into a human-readable string.
 */
function formatStorefrontAddress(addr: any): string {
  if (!addr) return ''
  if (typeof addr === 'string') return addr
  const parts: string[] = []
  if (Array.isArray(addr.addressLines)) parts.push(addr.addressLines.join(', '))
  if (addr.locality) parts.push(addr.locality)
  if (addr.administrativeArea) parts.push(addr.administrativeArea)
  if (addr.postalCode) parts.push(addr.postalCode)
  return parts.join(', ')
}

/**
 * Lists locations for a specified Google Business Profile account.
 * Queries Google My Business Information API v1, with pagination support and v4 fallback on 404.
 * Never silently swallows auth, permission, or quota errors.
 */
export async function listGoogleLocations(
  accessToken: string,
  accountName: string
): Promise<GoogleLocation[]> {
  const cleanAccount = accountName.startsWith('accounts/') ? accountName : `accounts/${accountName}`
  const allLocations: GoogleLocation[] = []
  let pageToken: string | undefined
  let pages = 0
  const maxPages = 10

  while (pages < maxPages) {
    const baseUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${cleanAccount}/locations?readMask=name,title,storefrontAddress,metadata`
    const url = pageToken ? `${baseUrl}&pageToken=${encodeURIComponent(pageToken)}` : baseUrl

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    if (response.ok) {
      const data = await response.json()
      const rawLocations = Array.isArray(data?.locations) ? data.locations : []
      for (const loc of rawLocations) {
        const locName = loc.name || ''
        const canonicalId = locName.startsWith('accounts/')
          ? locName
          : `${cleanAccount}/${locName.replace(/^\/+/, '')}`

        allLocations.push({
          id: canonicalId,
          name: locName,
          title: loc.title || loc.locationName || 'Unnamed Location',
          address: formatStorefrontAddress(loc.storefrontAddress || loc.address),
          placeId: loc.metadata?.placeId || loc.placeId || '',
          accountName: cleanAccount,
        })
      }

      const nextToken = typeof data?.nextPageToken === 'string' ? data.nextPageToken.trim() : ''
      if (!nextToken || nextToken === pageToken || rawLocations.length === 0) break
      pageToken = nextToken
      pages++
    } else {
      let errorData: any = null
      try {
        errorData = await response.json()
      } catch {}
      const googleMsg = errorData?.error?.message || response.statusText || 'Google API error'

      if ((response.status === 404 || response.status === 403) && pages === 0) {
        // Fallback to legacy v4 endpoint on 404 or 403
        try {
          const fallbackRes = await fetch(`${GBP_API_BASE}/${cleanAccount}/locations`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          })
          if (fallbackRes.ok) {
            const data = await fallbackRes.json()
            const rawLocations = Array.isArray(data?.locations) ? data.locations : []
            if (rawLocations.length > 0) {
              return rawLocations.map((loc: any) => {
                const locName = loc.name || ''
                const canonicalId = locName.startsWith('accounts/')
                  ? locName
                  : `${cleanAccount}/${locName.replace(/^\/+/, '')}`
                return {
                  id: canonicalId,
                  name: locName,
                  title: loc.title || loc.locationName || 'Unnamed Location',
                  address: formatStorefrontAddress(loc.storefrontAddress || loc.address),
                  placeId: loc.metadata?.placeId || loc.placeId || '',
                  accountName: cleanAccount,
                }
              })
            }
          }
        } catch {}
      }

      if (response.status === 401) {
        throw new GoogleApiError(
          'Google session expired or invalid. Please re-authenticate your Google account.',
          401,
          'GOOGLE_REAUTH_REQUIRED',
          googleMsg
        )
      }
      if (response.status === 403) {
        const isServiceDisabled =
          googleMsg.toLowerCase().includes('disabled') ||
          googleMsg.toLowerCase().includes('has not been used in project') ||
          errorData?.error?.details?.some((d: any) => d.reason === 'SERVICE_DISABLED')

        const subcode = isServiceDisabled ? 'GOOGLE_API_DISABLED' : 'GOOGLE_PERMISSION_DENIED'

        const { projectNumber, serviceName, activationUrl } = parseGoogleApiErrorDetails(
          googleMsg,
          errorData,
          'mybusinessbusinessinformation.googleapis.com'
        )

        const projectHint = projectNumber ? ` (Google Cloud Project: ${projectNumber})` : ''
        const urlHint = activationUrl ? ` Enable it here: ${activationUrl}` : ''
        const message = isServiceDisabled
          ? `Google Business Information API is disabled in your Google Cloud project${projectHint}. The required Google Cloud APIs are disabled. Please verify that "My Business Business Information API" is enabled in the Google Cloud Console.${urlHint}`
          : `Access to locations for account ${cleanAccount} was denied. Please verify your permissions in Google Business Profile.`

        throw new GoogleApiError(
          message,
          403,
          'GOOGLE_PERMISSION_DENIED',
          googleMsg,
          subcode,
          { projectNumber, serviceName, activationUrl }
        )
      }
      if (response.status === 429) {
        const { projectNumber, serviceName, isZeroQuota } = parseGoogleApiErrorDetails(
          googleMsg,
          errorData,
          'mybusinessbusinessinformation.googleapis.com'
        )

        const subcode = isZeroQuota ? 'GOOGLE_ZERO_QUOTA' : 'GOOGLE_RATE_LIMITED'
        const projectHint = projectNumber ? ` (Google Cloud Project: ${projectNumber})` : ''
        const accessUrl = 'https://developers.google.com/my-business/content/get-started#request-access'

        const message = isZeroQuota
          ? `Google Business Information API access has 0 quota in your Google Cloud project${projectHint}. Google Business Profile APIs require approval for Basic API Access before queries are permitted. Please submit an Application for Basic API Access to request quota.`
          : 'Google API rate limit reached. Please wait a few moments before retrying.'

        throw new GoogleApiError(
          message,
          429,
          'GOOGLE_QUOTA_EXCEEDED',
          googleMsg,
          subcode,
          {
            projectNumber,
            serviceName,
            activationUrl: isZeroQuota ? accessUrl : undefined,
          }
        )
      }

      throw new GoogleApiError(
        `Google API returned error status ${response.status}: ${googleMsg}`,
        response.status >= 500 ? 502 : response.status,
        'GOOGLE_API_ERROR',
        googleMsg
      )
    }
  }


  return allLocations
}

// Fetch reviews from Google Business Profile with pagination support
export async function fetchGoogleReviews(
  accessToken: string,
  accountName: string,
  locationName?: string,
  options?: { maxPages?: number; pageSize?: number }
): Promise<GoogleReview[]> {
  const maxPages = options?.maxPages ?? 10
  const pageSize = options?.pageSize ?? 50

  let url: string
  if (!locationName && accountName.includes('/locations/')) {
    // accountName is already the canonical location resource path e.g. "accounts/123/locations/456"
    url = `${GBP_API_BASE}/${accountName}/reviews?pageSize=${pageSize}`
  } else {
    const cleanAccount = accountName.replace(/^accounts\//, '')
    const cleanLocation = (locationName || '').replace(/^locations\//, '')
    url = `${GBP_API_BASE}/accounts/${cleanAccount}/locations/${cleanLocation}/reviews?pageSize=${pageSize}`
  }

  const allReviews: GoogleReview[] = []
  let pageToken: string | undefined
  let page = 0

  while (page < maxPages) {
    const pageUrl = pageToken ? `${url}&pageToken=${encodeURIComponent(pageToken)}` : url
    const response = await fetch(pageUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      let errorData: any = null
      try {
        errorData = await response.json()
      } catch {}
      const googleMsg = errorData?.error?.message || response.statusText || 'Google API error'
      if (response.status === 401) {
        throw new GoogleApiError(
          'Google session expired or invalid. Please re-authenticate your Google account.',
          401,
          'GOOGLE_REAUTH_REQUIRED',
          googleMsg
        )
      }
      if (response.status === 403) {
        throw new GoogleApiError(
          `Google Business Profile reviews permission denied: ${googleMsg}`,
          403,
          'GOOGLE_PERMISSION_DENIED',
          googleMsg
        )
      }
      throw new GoogleApiError(
        `Google API error ${response.status}: ${googleMsg}`,
        response.status >= 500 ? 502 : response.status,
        'GOOGLE_API_ERROR',
        googleMsg
      )
    }

    const data = await response.json().catch(() => ({}))
    const reviews: GoogleReview[] = Array.isArray(data?.reviews) ? data.reviews : []
    allReviews.push(...reviews)

    const nextToken = typeof data?.nextPageToken === 'string' ? data.nextPageToken.trim() : ''
    if (!nextToken || nextToken === pageToken || reviews.length === 0) break
    pageToken = nextToken
    page++
  }

  return allReviews
}

/**
 * Server-side verifies that a Google location ID is actually accessible
 * via the provided access token. Returns the verified location data on success,
 * or null if not found/accessible.
 *
 * This MUST be called before persisting any client-supplied locationId to prevent
 * cross-tenant location injection attacks.
 */
export async function verifyGoogleLocation(
  accessToken: string,
  locationId: string
): Promise<GoogleLocation | null> {
  if (!locationId || typeof locationId !== 'string' || locationId.trim().length === 0) {
    return null
  }

  // Discover all accounts and their locations, then find the requested locationId
  try {
    const accounts = await listGoogleAccounts(accessToken)
    if (accounts.length === 0) return null

    for (const account of accounts) {
      try {
        const locations = await listGoogleLocations(accessToken, account.id || account.name)
        const found = locations.find(loc =>
          loc.id === locationId ||
          loc.name === locationId ||
          // Also match on the canonical path variations
          loc.id.endsWith(locationId) ||
          locationId.endsWith(loc.id)
        )
        if (found) return found
      } catch {
        // Continue to next account if this one fails
      }
    }
  } catch {
    // Continue to direct location lookup
  }


  // Direct location lookup fallback:
  // If account enumeration was denied or empty, verify whether this specific location
  // resource is directly accessible with the caller's Google credentials.
  const cleanLocation = locationId.startsWith('/') ? locationId.slice(1) : locationId
  const resourceName = cleanLocation.startsWith('locations/') ? cleanLocation : `locations/${cleanLocation}`
  try {
    const directUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${resourceName}?readMask=name,title,storefrontAddress,metadata`
    const directRes = await fetch(directUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (directRes.ok) {
      const loc = await directRes.json()
      return {
        id: loc.name?.replace(/^locations\//, '') || cleanLocation.replace(/^locations\//, ''),
        name: loc.name || resourceName,
        title: loc.title || loc.locationName || 'Verified Location',
        address: formatStorefrontAddress(loc.storefrontAddress || loc.address),
        placeId: loc.metadata?.placeId || loc.placeId || '',
      }
    }
  } catch {}

  return null
}



// Post a reply to a Google review
export async function postGoogleReply(
  accessToken: string,
  reviewName: string,
  comment: string,
  locationResource?: string
): Promise<{ ok: boolean; status?: number; error?: string }> {
  // Ensure reviewName is a full resource name
  let fullPath = reviewName.startsWith('/') ? reviewName.slice(1) : reviewName
  if (!fullPath.includes('/reviews/') && locationResource) {
    const cleanLoc = locationResource.startsWith('/') ? locationResource.slice(1) : locationResource
    fullPath = `${cleanLoc}/reviews/${fullPath}`
  }
  const url = `${GBP_API_BASE}/${fullPath}/reply`

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ comment }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      return {
        ok: false,
        status: response.status,
        error: `Google API error ${response.status}: ${errorText}`,
      }
    }

    return { ok: true, status: response.status }
  } catch (e: any) {
    return { ok: false, error: e.message || 'Network error posting Google reply' }
  }
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
