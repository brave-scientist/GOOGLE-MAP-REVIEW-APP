// lib/crypto.ts — AES-256-GCM encryption for storing OAuth tokens at rest
// Uses Node's built-in crypto module with dual-key rotation support

import crypto from 'crypto'

/**
 * Canonical Key Architecture:
 * - Normal application operation:
 *     TOKEN_ENCRYPTION_KEY = active/current key used for all new encryptions
 * - Key rotation / migration window:
 *     TOKEN_ENCRYPTION_KEY = new target key (primary)
 *     OLD_ENCRYPTION_KEY   = previous key (fallback for reading legacy ciphertext)
 *
 * In production (NODE_ENV === 'production'), TOKEN_ENCRYPTION_KEY is strictly required.
 * In development/test (NODE_ENV !== 'production'), a deterministic fallback key is provided for local DX.
 */

// Default fallback key strictly for local development and test runners
const DEV_DEFAULT_KEY = 'reviewreply-dev-encryption-key-change-in-prod-32b!'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16

/**
 * Derives a deterministic 32-byte (256-bit) buffer from any string key.
 * Validates that key is non-empty.
 */
export function deriveKeyBuffer(key: string): Buffer {
  if (!key || typeof key !== 'string' || key.trim().length === 0) {
    throw new Error('Encryption key must be a non-empty string')
  }
  return crypto.createHash('sha256').update(key).digest()
}

/**
 * Gets the current active primary encryption key from environment.
 * Fails closed in production if TOKEN_ENCRYPTION_KEY is unset.
 */
export function getActiveEncryptionKey(): string {
  const envKey = process.env.TOKEN_ENCRYPTION_KEY
  if (envKey && envKey.trim().length > 0) {
    return envKey.trim()
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('TOKEN_ENCRYPTION_KEY environment variable is required in production')
  }

  return DEV_DEFAULT_KEY
}

/**
 * Gets the optional fallback/old encryption key from environment during rotation.
 */
export function getFallbackEncryptionKey(): string | null {
  const oldKey = process.env.OLD_ENCRYPTION_KEY
  return oldKey && oldKey.trim().length > 0 ? oldKey.trim() : null
}

/**
 * Encrypts plaintext using AES-256-GCM with a specified key.
 * Format: iv:authTag:encrypted (all hex encoded)
 */
export function encryptWithKey(text: string, key: string): string {
  const keyBuffer = deriveKeyBuffer(key)
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypts AES-256-GCM ciphertext using a specified key.
 * Throws an Error if format is invalid, ciphertext is corrupted, or auth tag fails.
 */
export function decryptWithKey(encryptedText: string, key: string): string {
  if (!encryptedText || typeof encryptedText !== 'string') {
    throw new Error('Invalid encrypted text format')
  }
  const parts = encryptedText.split(':')
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error('Invalid encrypted text format')
  }
  const iv = Buffer.from(parts[0], 'hex')
  const authTag = Buffer.from(parts[1], 'hex')
  const encrypted = Buffer.from(parts[2], 'hex')

  if (iv.length !== IV_LENGTH || authTag.length !== 16) {
    throw new Error('Invalid ciphertext component lengths')
  }

  const keyBuffer = deriveKeyBuffer(key)
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

/**
 * Decrypts ciphertext with dual-key fallback support.
 * First tries primaryKey (or active env key).
 * If that fails and fallbackKey is provided, attempts decryption with fallbackKey.
 */
export function decryptWithFallback(
  encryptedText: string,
  primaryKey?: string,
  fallbackKey?: string
): { plaintext: string; keyUsed: 'primary' | 'fallback' } {
  const primary = primaryKey || getActiveEncryptionKey()
  const fallback = fallbackKey || getFallbackEncryptionKey()

  try {
    const plaintext = decryptWithKey(encryptedText, primary)
    return { plaintext, keyUsed: 'primary' }
  } catch (primaryErr) {
    if (fallback && fallback !== primary) {
      try {
        const plaintext = decryptWithKey(encryptedText, fallback)
        return { plaintext, keyUsed: 'fallback' }
      } catch {
        throw new Error('Decryption failed with both primary and fallback encryption keys')
      }
    }
    throw primaryErr
  }
}

/**
 * Backwards-compatible encrypt function using active environment key.
 */
export function encrypt(text: string): string {
  return encryptWithKey(text, getActiveEncryptionKey())
}

/**
 * Backwards-compatible decrypt function using active key with transparent fallback support.
 */
export function decrypt(encryptedText: string): string {
  return decryptWithFallback(encryptedText).plaintext
}

/**
 * Encrypts an access token and refresh token pair using the active or specified key.
 */
export function encryptTokenPair(
  accessToken: string,
  refreshToken: string,
  key?: string
): {
  accessTokenEnc: string
  refreshTokenEnc: string
} {
  const activeKey = key || getActiveEncryptionKey()
  return {
    accessTokenEnc: encryptWithKey(accessToken, activeKey),
    refreshTokenEnc: encryptWithKey(refreshToken, activeKey),
  }
}

/**
 * Decrypts an access token and refresh token pair with transparent dual-key fallback.
 */
export function decryptTokenPair(
  accessTokenEnc: string,
  refreshTokenEnc: string,
  key?: string
): {
  accessToken: string
  refreshToken: string
} {
  if (key) {
    return {
      accessToken: decryptWithKey(accessTokenEnc, key),
      refreshToken: decryptWithKey(refreshTokenEnc, key),
    }
  }
  return {
    accessToken: decrypt(accessTokenEnc),
    refreshToken: decrypt(refreshTokenEnc),
  }
}
