// lib/oauth-store.ts — Provider-agnostic OAuth token storage
// Stores encrypted access/refresh tokens in the OAuthToken table

import { db } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/crypto'

export interface StoredTokens {
  accessToken: string
  refreshToken: string
  expiresAt: Date | null
  scopes: string
}

// Store or update tokens for a business + provider
export async function storeTokens(params: {
  businessId: string
  provider: string // 'google' | 'facebook' | 'apple'
  accessToken: string
  refreshToken: string
  expiresAt?: Date | null
  scopes?: string
}): Promise<void> {
  const { businessId, provider, accessToken, refreshToken, expiresAt, scopes } = params

  await db.oAuthToken.upsert({
    where: {
      businessId_provider: { businessId, provider },
    },
    create: {
      businessId,
      provider,
      accessTokenEnc: encrypt(accessToken),
      refreshTokenEnc: encrypt(refreshToken),
      expiresAt: expiresAt || null,
      scopes: scopes || '',
    },
    update: {
      accessTokenEnc: encrypt(accessToken),
      refreshTokenEnc: encrypt(refreshToken),
      expiresAt: expiresAt || null,
      scopes: scopes || '',
    },
  })
}

// Retrieve and decrypt tokens for a business + provider
export async function getTokens(businessId: string, provider: string): Promise<StoredTokens | null> {
  const token = await db.oAuthToken.findUnique({
    where: {
      businessId_provider: { businessId, provider },
    },
  })

  if (!token) return null

  return {
    accessToken: decrypt(token.accessTokenEnc),
    refreshToken: decrypt(token.refreshTokenEnc),
    expiresAt: token.expiresAt,
    scopes: token.scopes,
  }
}

// Update only the access token (after a refresh)
export async function updateAccessToken(businessId: string, provider: string, accessToken: string, expiresAt: Date | null): Promise<void> {
  await db.oAuthToken.update({
    where: {
      businessId_provider: { businessId, provider },
    },
    data: {
      accessTokenEnc: encrypt(accessToken),
      expiresAt,
    },
  })
}

// Delete tokens (disconnect)
export async function deleteTokens(businessId: string, provider: string): Promise<void> {
  await db.oAuthToken.deleteMany({
    where: { businessId, provider },
  })
}

// Check if tokens exist for a provider
export async function hasTokens(businessId: string, provider: string): Promise<boolean> {
  const count = await db.oAuthToken.count({
    where: { businessId, provider },
  })
  return count > 0
}
