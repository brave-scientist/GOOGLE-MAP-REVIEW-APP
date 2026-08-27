import crypto from 'crypto'
import { db } from '@/lib/db'
import { Role, Plan } from '@prisma/client'
import { EncryptJWT, jwtDecrypt } from 'jose'
import { NextRequest, NextResponse } from 'next/server'
import { SessionUser } from '@/lib/session'
import { getRedisClient } from '@/lib/rate-limit'

export const OAUTH_STATE_COOKIE = 'rr_oauth_google_state'
export const OAUTH_STATE_TTL_SECONDS = 600 // 10 minutes

const SECRET_KEY = process.env.SESSION_SECRET || 'reviewreply-dev-secret-change-in-production-min-32-chars'

// In-memory single-use transaction store for fast atomic check & local/fallback execution
const consumedOAuthTransactions = new Map<string, number>()

// Periodic cleanup of expired in-memory consumed transaction entries
if (typeof setInterval !== 'undefined') {
  const cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, expiresAt] of consumedOAuthTransactions.entries()) {
      if (expiresAt < now) {
        consumedOAuthTransactions.delete(key)
      }
    }
  }, 5 * 60 * 1000)
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer && typeof (cleanupTimer as any).unref === 'function') {
    ;(cleanupTimer as any).unref()
  }
}

/**
 * Derives a dedicated 256-bit symmetric encryption key from SESSION_SECRET for OAuth state JWE.
 */
function getOAuthEncryptionKey(): Uint8Array {
  return crypto
    .createHash('sha256')
    .update('rr-oauth-state-encryption-key-v1:' + SECRET_KEY)
    .digest()
}

export interface GoogleOAuthConfig {
  clientId: string
  clientSecret: string
  configured: boolean
}

export interface OAuthStatePayload {
  state: string
  nonce: string
  codeVerifier: string
  linkUserId?: string | null
  returnTo?: string | null
  createdAt: number
}

export interface GoogleTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  id_token: string
  scope: string
  refresh_token?: string
}

export interface VerifiedGoogleUser {
  sub: string
  email: string
  emailVerified: boolean
  name?: string
  picture?: string
}

/**
 * Validates and retrieves Google OAuth configuration.
 * Fails closed in production if credentials are missing or empty.
 */
export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || ''
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || ''

  const isProd = process.env.NODE_ENV === 'production'
  const isConfigured = clientId.length > 0 && clientSecret.length > 0

  if (isProd && !isConfigured) {
    // In production, missing credentials must fail closed
    return {
      clientId: '',
      clientSecret: '',
      configured: false,
    }
  }

  return {
    clientId,
    clientSecret,
    configured: isConfigured,
  }
}

/**
 * Generates cryptographically secure random string.
 * Minimum 32 bytes of entropy.
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
 * Encrypts and encodes the temporary OAuth transaction state using JWE (AES-256-GCM).
 * Provides confidentiality, integrity, authenticity, and expiration.
 */
export async function encodeOAuthState(payload: OAuthStatePayload): Promise<string> {
  const encryptionKey = getOAuthEncryptionKey()
  return await new EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + OAUTH_STATE_TTL_SECONDS)
    .encrypt(encryptionKey)
}

/**
 * Decrypts and verifies the temporary OAuth transaction state from JWE.
 */
export async function decodeOAuthState(token: string): Promise<OAuthStatePayload | null> {
  try {
    const encryptionKey = getOAuthEncryptionKey()
    const { payload } = await jwtDecrypt(token, encryptionKey)
    if (!payload.state || !payload.nonce || !payload.codeVerifier) {
      return null
    }
    return {
      state: payload.state as string,
      nonce: payload.nonce as string,
      codeVerifier: payload.codeVerifier as string,
      linkUserId: (payload.linkUserId as string) || null,
      returnTo: (payload.returnTo as string) || null,
      createdAt: (payload.createdAt as number) || (payload.iat as number) * 1000,
    }
  } catch {
    return null
  }
}

/**
 * Atomically consumes an OAuth transaction state to guarantee true single-use semantics
 * and prevent concurrent replay race conditions.
 * Returns true if successfully claimed, or false if already consumed / race condition detected.
 */
export async function consumeOAuthTransaction(
  state: string,
  ttlMs: number = OAUTH_STATE_TTL_SECONDS * 1000
): Promise<boolean> {
  if (!state || typeof state !== 'string' || state.trim().length === 0) {
    return false
  }

  // 1. Try Redis atomic SET NX PX if Redis is configured
  const redis = getRedisClient()
  if (redis) {
    try {
      const res = await redis.set(`oauth:consumed:${state}`, '1', {
        nx: true,
        px: ttlMs,
      })
      if (!res || (res !== 'OK' && res !== 'true')) {
        return false
      }
      return true
    } catch (err) {
      console.warn('[OAuth] Upstash Redis consume error, falling back to in-memory store:', err)
    }
  }

  // 2. In-memory atomic single-use check
  const now = Date.now()
  const existingExpiresAt = consumedOAuthTransactions.get(state)
  if (existingExpiresAt && existingExpiresAt > now) {
    return false
  }

  consumedOAuthTransactions.set(state, now + ttlMs)
  return true
}

/**
 * Clears in-memory consumed transactions (for testing purposes).
 */
export function _clearConsumedOAuthTransactions(): void {
  consumedOAuthTransactions.clear()
}

function shouldUseSecureCookie(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_APP_URL?.startsWith('https') === true
}

/**
 * Sets the secure, encrypted OAuth transaction state cookie on a response.
 */
export async function setOAuthStateCookie(response: NextResponse, payload: OAuthStatePayload) {
  const token = await encodeOAuthState(payload)
  response.cookies.set(OAUTH_STATE_COOKIE, token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    maxAge: OAUTH_STATE_TTL_SECONDS,
    path: '/',
  })
}

/**
 * Clears the OAuth state cookie.
 */
export function clearOAuthStateCookie(response: NextResponse) {
  response.cookies.set(OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}

/**
 * Reads and decodes the OAuth state cookie from a request.
 */
export async function getOAuthStateFromRequest(request: NextRequest): Promise<OAuthStatePayload | null> {
  const token = request.cookies.get(OAUTH_STATE_COOKIE)?.value
  if (!token) return null
  return await decodeOAuthState(token)
}

/**
 * Builds Google OAuth 2.0 / OIDC authorization URL.
 */
export function buildGoogleAuthUrl(params: {
  clientId: string
  redirectUri: string
  state: string
  nonce: string
  codeChallenge: string
}): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', params.state)
  url.searchParams.set('nonce', params.nonce)
  url.searchParams.set('code_challenge', params.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('access_type', 'online')
  url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

/**
 * Exchanges Google authorization code for tokens.
 */
export async function exchangeGoogleAuthCode(params: {
  code: string
  codeVerifier: string
  redirectUri: string
  clientId: string
  clientSecret: string
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: params.codeVerifier,
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    throw new Error(`Google token exchange failed with status ${res.status}: ${errorText}`)
  }

  return (await res.json()) as GoogleTokenResponse
}

/**
 * Parses and verifies a Google ID token payload.
 * Validates issuer, audience, expiration, nonce, and email_verified.
 */
export async function verifyGoogleIdTokenClaims(params: {
  idToken: string
  expectedAudience: string
  expectedNonce: string
  fetchTokenInfo?: boolean
}): Promise<VerifiedGoogleUser> {
  const { idToken, expectedAudience, expectedNonce, fetchTokenInfo = true } = params

  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Missing ID token')
  }

  // Parse JWT parts safely
  const parts = idToken.split('.')
  if (parts.length !== 3) {
    throw new Error('Malformed ID token structure')
  }

  let claims: any
  try {
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8')
    claims = JSON.parse(payloadJson)
  } catch {
    throw new Error('Failed to parse ID token payload')
  }

  // Verify Issuer
  const validIssuers = ['https://accounts.google.com', 'accounts.google.com']
  if (!claims.iss || !validIssuers.includes(claims.iss)) {
    throw new Error(`Invalid ID token issuer: ${claims.iss}`)
  }

  // Verify Audience
  if (!claims.aud || claims.aud !== expectedAudience) {
    throw new Error(`Invalid ID token audience: ${claims.aud}`)
  }

  // Verify Expiration
  const nowInSeconds = Math.floor(Date.now() / 1000)
  if (!claims.exp || typeof claims.exp !== 'number' || claims.exp <= nowInSeconds) {
    throw new Error('Expired ID token')
  }

  // Verify Nonce
  if (!claims.nonce || claims.nonce !== expectedNonce) {
    throw new Error('ID token nonce mismatch')
  }

  // Verify Google sub
  if (!claims.sub || typeof claims.sub !== 'string' || claims.sub.trim().length === 0) {
    throw new Error('Missing or empty sub claim in ID token')
  }

  // Verify Email Verified
  const isEmailVerified = claims.email_verified === true || claims.email_verified === 'true'
  if (!isEmailVerified) {
    throw new Error('Google email is not verified')
  }

  if (!claims.email || typeof claims.email !== 'string') {
    throw new Error('Missing email claim in ID token')
  }

  // Optional: Verify signature/token via Google's tokeninfo endpoint
  if (fetchTokenInfo) {
    try {
      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`)
      if (!verifyRes.ok) {
        throw new Error(`Tokeninfo verification failed with status ${verifyRes.status}`)
      }
      const tokenInfo = await verifyRes.json()
      if (tokenInfo.aud !== expectedAudience) {
        throw new Error('Tokeninfo audience mismatch')
      }
      if (tokenInfo.sub !== claims.sub) {
        throw new Error('Tokeninfo sub mismatch')
      }
    } catch (e: any) {
      throw new Error(`Remote Google token verification failed: ${e.message}`)
    }
  }

  return {
    sub: claims.sub,
    email: claims.email.trim().toLowerCase(),
    emailVerified: isEmailVerified,
    name: claims.name || undefined,
    picture: claims.picture || undefined,
  }
}

/**
 * Resolves Google Identity against ReviewReply database models:
 * Case A: Existing Google Account -> Authenticate associated user.
 * Case B: Verified Google email matches existing ReviewReply user -> Link Account to existing user safely.
 * Case C: New user -> Create User, Org, OrgMember, Business, demo reviews, and Account.
 * Case D: Unverified email -> Rejected.
 * Case E: Explicit account linking for authenticated caller -> Links Account to caller user ID.
 */
export async function resolveGoogleIdentity(params: {
  googleUser: VerifiedGoogleUser
  linkUserId?: string | null
}): Promise<{ user: any; isNewUser: boolean; isLinked: boolean }> {
  const { googleUser, linkUserId } = params
  const { sub, email, emailVerified, name, picture } = googleUser

  if (!emailVerified) {
    throw new Error('Google email is not verified. Account creation or linking is rejected.')
  }

  const normalizedEmail = email.trim().toLowerCase()

  // ── Explicit Linking Flow (Case E) ──
  if (linkUserId) {
    const targetUser = await db.user.findUnique({
      where: { id: linkUserId },
      include: {
        memberships: {
          include: { org: { select: { id: true, name: true, plan: true } } },
        },
      },
    })

    if (!targetUser) {
      throw new Error('Authenticated user for linking not found')
    }

    // Check if this Google sub is already linked to ANOTHER user
    const existingAccount = await db.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: sub,
        },
      },
    })

    if (existingAccount && existingAccount.userId !== targetUser.id) {
      throw new Error('This Google account is already linked to another ReviewReply user.')
    }

    if (!existingAccount) {
      await db.account.create({
        data: {
          userId: targetUser.id,
          provider: 'google',
          providerAccountId: sub,
          email: normalizedEmail,
        },
      })

      await db.auditLog.create({
        data: {
          actorId: targetUser.id,
          action: 'auth.account_linked',
          targetType: 'account',
          targetId: targetUser.id,
          metadata: JSON.stringify({ provider: 'google', providerAccountId: sub, email: normalizedEmail }),
        },
      })
    }

    return { user: targetUser, isNewUser: false, isLinked: true }
  }

  // ── Case A: Existing Google Account Identity ──
  const existingAccount = await db.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: 'google',
        providerAccountId: sub,
      },
    },
    include: {
      user: {
        include: {
          memberships: {
            include: { org: { select: { id: true, name: true, plan: true } } },
          },
        },
      },
    },
  })

  if (existingAccount && existingAccount.user) {
    const user = existingAccount.user
    // Update avatar/name if not present
    if (!user.avatarUrl && picture) {
      await db.user.update({
        where: { id: user.id },
        data: { avatarUrl: picture },
      }).catch(() => {})
    }

    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'user.login',
        targetType: 'user',
        targetId: user.id,
        metadata: JSON.stringify({ method: 'google', providerAccountId: sub }),
      },
    })

    return { user, isNewUser: false, isLinked: false }
  }

  // ── Case B: No Google Account, but verified Google email matches existing ReviewReply user ──
  const existingUserByEmail = await db.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      memberships: {
        include: { org: { select: { id: true, name: true, plan: true } } },
      },
    },
  })

  if (existingUserByEmail) {
    // Safe linking because email_verified === true
    await db.account.create({
      data: {
        userId: existingUserByEmail.id,
        provider: 'google',
        providerAccountId: sub,
        email: normalizedEmail,
      },
    })

    await db.auditLog.create({
      data: {
        actorId: existingUserByEmail.id,
        action: 'auth.account_linked',
        targetType: 'user',
        targetId: existingUserByEmail.id,
        metadata: JSON.stringify({ method: 'google_auto_link', providerAccountId: sub, email: normalizedEmail }),
      },
    })

    await db.auditLog.create({
      data: {
        actorId: existingUserByEmail.id,
        action: 'user.login',
        targetType: 'user',
        targetId: existingUserByEmail.id,
        metadata: JSON.stringify({ method: 'google', providerAccountId: sub }),
      },
    })

    return { user: existingUserByEmail, isNewUser: false, isLinked: true }
  }

  // ── Case C: No matching identity + no matching user -> Create new account ──
  const result = await db.$transaction(async (tx) => {
    const displayName = name || normalizedEmail.split('@')[0]
    const newUser = await tx.user.create({
      data: {
        email: normalizedEmail,
        name: displayName,
        avatarUrl: picture || null,
        sessionVersion: 1,
      },
    })

    const org = await tx.organization.create({
      data: {
        name: `${displayName}'s Organization`,
        plan: Plan.PRO,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    })

    await tx.orgMember.create({
      data: {
        orgId: org.id,
        userId: newUser.id,
        role: Role.OWNER,
      },
    })

    const business = await tx.business.create({
      data: {
        orgId: org.id,
        ownerId: newUser.id,
        name: `${displayName}'s Business`,
        industry: 'restaurant',
        timezone: 'America/New_York',
      },
    })

    // Seed demo reviews
    const demoReviews = [
      { rating: 5, text: 'Amazing experience! The staff was incredibly welcoming.', topics: ['service', 'staff'] },
      { rating: 4, text: 'Great food and atmosphere. Will be back!', topics: ['food', 'atmosphere'] },
      { rating: 5, text: 'Best in the area. Highly recommend.', topics: ['food', 'value'] },
    ]
    for (const r of demoReviews) {
      await tx.review.create({
        data: {
          businessId: business.id,
          source: 'GOOGLE',
          externalId: `google_${business.id}_${Math.random().toString(36).slice(2)}`,
          author: ['Sarah Chen', 'Marcus Webb', 'Priya Patel'][Math.floor(Math.random() * 3)],
          rating: r.rating,
          title: r.rating >= 4 ? 'Great experience!' : 'Mixed experience',
          text: r.text,
          sentimentScore: r.rating >= 4 ? 0.7 + Math.random() * 0.3 : 0.1,
          topics: JSON.stringify(r.topics),
          draftStatus: 'NONE',
          createdAt: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)),
          fetchedAt: new Date(),
        },
      })
    }

    // Create Account identity
    await tx.account.create({
      data: {
        userId: newUser.id,
        provider: 'google',
        providerAccountId: sub,
        email: normalizedEmail,
      },
    })

    await tx.auditLog.create({
      data: {
        actorId: newUser.id,
        action: 'user.signup',
        targetType: 'user',
        targetId: newUser.id,
        metadata: JSON.stringify({ email: normalizedEmail, method: 'google', providerAccountId: sub }),
      },
    })

    return { user: newUser, org }
  })

  const fullUser = {
    ...result.user,
    memberships: [
      {
        orgId: result.org.id,
        userId: result.user.id,
        role: Role.OWNER,
        org: result.org,
      },
    ],
  }

  return { user: fullUser, isNewUser: true, isLinked: false }
}

/**
 * Creates standard SessionUser object from a User record.
 */
export function buildSessionUser(user: any): SessionUser {
  const membership = user.memberships?.[0]
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: membership?.role || Role.VIEWER,
    orgId: membership?.org?.id || null,
    orgName: membership?.org?.name || null,
    orgPlan: membership?.org?.plan || null,
    sessionVersion: user.sessionVersion ?? 1,
  }
}
