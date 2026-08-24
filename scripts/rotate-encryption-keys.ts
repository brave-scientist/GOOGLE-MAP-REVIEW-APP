#!/usr/bin/env tsx
/**
 * scripts/rotate-encryption-keys.ts
 *
 * Standalone administrative CLI runner for rotating AES-256-GCM OAuthToken encryption keys.
 *
 * Canonical Security & Environment Architecture:
 * - OLD_ENCRYPTION_KEY : Source encryption key (must be set in env)
 * - NEW_ENCRYPTION_KEY : Target encryption key (must be set in env)
 * - DATABASE_URL       : PostgreSQL connection string
 *
 * CLI Flags:
 * - Exactly one of --dry-run or --live is required.
 * - Secret arguments (--old-key, --new-key) are FORBIDDEN to prevent shell history leaks.
 *
 * Transaction Safety:
 * - Phase A (Preflight): Decrypts and re-encrypts all tokens in memory. Verifies integrity.
 *   If any single token fails decryption, the process halts immediately with ZERO database writes.
 * - Phase B (Commit): All updates + audit log commit atomically inside a single Prisma $transaction.
 *   If the transaction fails or is interrupted, all changes roll back completely.
 */

import { PrismaClient } from '@prisma/client'
import { decryptWithKey, encryptWithKey } from '../src/lib/crypto'

export interface KeyRotationOptions {
  oldKey: string
  newKey: string
  isLive: boolean
  prismaClient?: PrismaClient
}

export interface MigrationResult {
  totalTokens: number
  alreadyUsingNewKey: number
  requiresRotation: number
  corruptOrFailed: number
  databaseWrites: number
  committed: boolean
}

/**
 * Validates CLI arguments to ensure secrets are NOT passed via command-line flags.
 */
export function validateCliArgs(args: string[]): { isDryRun: boolean; isLive: boolean } {
  if (args.includes('--old-key') || args.includes('--new-key')) {
    throw new Error(
      'Passing encryption keys via CLI flags (--old-key / --new-key) is forbidden for security. Set OLD_ENCRYPTION_KEY and NEW_ENCRYPTION_KEY environment variables instead.'
    )
  }

  const isDryRun = args.includes('--dry-run')
  const isLive = args.includes('--live')

  if ((isDryRun && isLive) || (!isDryRun && !isLive)) {
    throw new Error('Must specify exactly one operational mode: either --dry-run or --live.')
  }

  return { isDryRun, isLive }
}

/**
 * Executes the key rotation migration workflow.
 */
export async function runKeyRotation(options: KeyRotationOptions): Promise<MigrationResult> {
  const { oldKey, newKey, isLive } = options
  const prisma = options.prismaClient || new PrismaClient()

  if (!oldKey || typeof oldKey !== 'string' || oldKey.trim().length === 0) {
    throw new Error('OLD_ENCRYPTION_KEY must be a non-empty string')
  }
  if (!newKey || typeof newKey !== 'string' || newKey.trim().length === 0) {
    throw new Error('NEW_ENCRYPTION_KEY must be a non-empty string')
  }
  if (oldKey.trim() === newKey.trim()) {
    throw new Error('OLD_ENCRYPTION_KEY and NEW_ENCRYPTION_KEY must be distinct keys')
  }

  // -------------------------------------------------------------------------
  // PHASE A: PREFLIGHT & MEMORY VALIDATION
  // -------------------------------------------------------------------------
  const allTokens = await prisma.oAuthToken.findMany()
  const totalTokens = allTokens.length

  let alreadyUsingNewKey = 0
  let requiresRotation = 0
  let corruptOrFailed = 0

  interface PendingUpdate {
    id: string
    newAccessTokenEnc: string
    newRefreshTokenEnc: string
  }

  const updates: PendingUpdate[] = []

  for (const token of allTokens) {
    let accessPlaintext: string | null = null
    let refreshPlaintext: string | null = null
    let isAlreadyNew = false

    // Step 1: Check if token is already encrypted with NEW_KEY (idempotency)
    try {
      accessPlaintext = decryptWithKey(token.accessTokenEnc, newKey)
      refreshPlaintext = decryptWithKey(token.refreshTokenEnc, newKey)
      isAlreadyNew = true
    } catch {
      isAlreadyNew = false
    }

    if (isAlreadyNew) {
      alreadyUsingNewKey++
      continue
    }

    // Step 2: Attempt decryption using OLD_KEY
    try {
      accessPlaintext = decryptWithKey(token.accessTokenEnc, oldKey)
      refreshPlaintext = decryptWithKey(token.refreshTokenEnc, oldKey)
    } catch {
      corruptOrFailed++
      continue
    }

    // Step 3: Re-encrypt with NEW_KEY in memory
    const newAccessTokenEnc = encryptWithKey(accessPlaintext, newKey)
    const newRefreshTokenEnc = encryptWithKey(refreshPlaintext, newKey)

    // Step 4: Preflight self-verification (assert new ciphertext decrypts with NEW_KEY)
    try {
      const verifyAccess = decryptWithKey(newAccessTokenEnc, newKey)
      const verifyRefresh = decryptWithKey(newRefreshTokenEnc, newKey)
      if (verifyAccess !== accessPlaintext || verifyRefresh !== refreshPlaintext) {
        throw new Error('Preflight integrity self-check failed')
      }
    } catch {
      corruptOrFailed++
      continue
    }

    requiresRotation++
    updates.push({
      id: token.id,
      newAccessTokenEnc,
      newRefreshTokenEnc,
    })
  }

  // SAFETY INVARIANT: IF ANY TOKEN FAILS PREFLIGHT, ZERO DATABASE WRITES OCCUR
  if (corruptOrFailed > 0) {
    if (!options.prismaClient) {
      await prisma.$disconnect()
    }
    throw new Error(
      `Key rotation aborted during preflight: ${corruptOrFailed} token record(s) failed decryption. Zero database records were modified.`
    )
  }

  // -------------------------------------------------------------------------
  // PHASE B: ATOMIC TRANSACTION COMMIT (LIVE MODE ONLY)
  // -------------------------------------------------------------------------
  let committed = false
  let databaseWrites = 0

  if (isLive && updates.length > 0) {
    try {
      await prisma.$transaction(async (tx) => {
        for (const update of updates) {
          await tx.oAuthToken.update({
            where: { id: update.id },
            data: {
              accessTokenEnc: update.newAccessTokenEnc,
              refreshTokenEnc: update.newRefreshTokenEnc,
            },
          })
        }

        await tx.auditLog.create({
          data: {
            action: 'security.tokens_reencrypted',
            actorId: 'system.key_rotation',
            metadata: JSON.stringify({
              totalTokens,
              migratedCount: updates.length,
              alreadyNewCount: alreadyUsingNewKey,
              timestamp: new Date().toISOString(),
            }),
          },
        })
      })

      // databaseWrites accurately represents committed database update count
      committed = true
      databaseWrites = updates.length
    } catch (_txError) {
      if (!options.prismaClient) {
        await prisma.$disconnect()
      }
      throw new Error('Key rotation transaction failed and was rolled back completely.')
    }
  }

  if (!options.prismaClient) {
    await prisma.$disconnect()
  }

  return {
    totalTokens,
    alreadyUsingNewKey,
    requiresRotation,
    corruptOrFailed,
    databaseWrites,
    committed,
  }
}

// Administrative CLI Entry Point
async function main() {
  const args = process.argv.slice(2)

  let runMode: { isDryRun: boolean; isLive: boolean }
  try {
    runMode = validateCliArgs(args)
  } catch (argErr: any) {
    console.error(`Error: ${argErr.message}`)
    console.error('Usage: OLD_ENCRYPTION_KEY="..." NEW_ENCRYPTION_KEY="..." tsx scripts/rotate-encryption-keys.ts [--dry-run | --live]')
    process.exit(1)
  }

  const oldKey = process.env.OLD_ENCRYPTION_KEY
  const newKey = process.env.NEW_ENCRYPTION_KEY

  if (!oldKey || oldKey.trim().length === 0) {
    console.error('Error: Missing required environment variable OLD_ENCRYPTION_KEY.')
    process.exit(1)
  }
  if (!newKey || newKey.trim().length === 0) {
    console.error('Error: Missing required environment variable NEW_ENCRYPTION_KEY.')
    process.exit(1)
  }

  console.log('======================================================')
  console.log(`REVIEWREPLY OAUTH TOKEN KEY ROTATION RUNNER [${runMode.isLive ? 'LIVE' : 'DRY RUN'}]`)
  console.log('======================================================')

  try {
    const result = await runKeyRotation({
      oldKey: oldKey.trim(),
      newKey: newKey.trim(),
      isLive: runMode.isLive,
    })

    if (runMode.isDryRun) {
      console.log('\nDRY RUN')
      console.log('--------')
      console.log(`Total tokens: ${result.totalTokens}`)
      console.log(`Already using new key: ${result.alreadyUsingNewKey}`)
      console.log(`Requires rotation: ${result.requiresRotation}`)
      console.log(`Invalid/corrupt: ${result.corruptOrFailed}`)
      console.log(`Database writes: 0`)
      console.log('\nDry run completed successfully. Zero database writes performed.')
    } else {
      console.log('\nLIVE')
      console.log('--------')
      console.log(`Total tokens: ${result.totalTokens}`)
      console.log(`Migrated: ${result.databaseWrites}`)
      console.log(`Already migrated: ${result.alreadyUsingNewKey}`)
      console.log(`Failed: 0`)
      console.log(`Database committed: ${result.committed ? 'YES' : 'NO'}`)
      console.log('\nKey rotation completed and committed to PostgreSQL.')
    }
  } catch (err: any) {
    console.error(`\nExecution failed: ${err.message}`)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}
