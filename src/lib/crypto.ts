// lib/crypto.ts — AES-256-GCM encryption for storing OAuth tokens at rest
// Uses Node's built-in crypto module with a key from env var

import crypto from 'crypto'

// Get encryption key from env — must be 32 bytes (64 hex chars)
// In dev, use a default key (NOT for production)
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || 'reviewreply-dev-encryption-key-change-in-prod-32b!'
const KEY_BUFFER = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest() // Always 32 bytes

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY_BUFFER, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  // Format: iv:authTag:encrypted (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format')
  }
  const iv = Buffer.from(parts[0], 'hex')
  const authTag = Buffer.from(parts[1], 'hex')
  const encrypted = Buffer.from(parts[2], 'hex')

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY_BUFFER, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

// Helper: encrypt a token pair
export function encryptTokenPair(accessToken: string, refreshToken: string): {
  accessTokenEnc: string
  refreshTokenEnc: string
} {
  return {
    accessTokenEnc: encrypt(accessToken),
    refreshTokenEnc: encrypt(refreshToken),
  }
}

// Helper: decrypt a token pair
export function decryptTokenPair(accessTokenEnc: string, refreshTokenEnc: string): {
  accessToken: string
  refreshToken: string
} {
  return {
    accessToken: decrypt(accessTokenEnc),
    refreshToken: decrypt(refreshTokenEnc),
  }
}
