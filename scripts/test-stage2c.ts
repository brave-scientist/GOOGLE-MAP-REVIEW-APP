import {
  encryptWithKey,
  decryptWithKey,
  decryptWithFallback,
  encryptTokenPair,
  decryptTokenPair,
  deriveKeyBuffer,
  getActiveEncryptionKey,
} from '../src/lib/crypto'
import { runKeyRotation, validateCliArgs } from './rotate-encryption-keys'

async function runStage2CTests() {
  console.log('=================================================================')
  console.log('REVIEWREPLY STAGE 2 — MILESTONE 2C CRYPTOGRAPHIC ROTATION TESTS')
  console.log('=================================================================\n')

  let passed = 0
  let failed = 0

  function verify(testId: string, name: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(`  ✓ [${testId}] PASS: ${name}`)
      passed++
    } else {
      console.error(`  ✗ [${testId}] FAIL: ${name}${details ? ` -> ${details}` : ''}`)
      failed++
    }
  }

  const KEY_A = 'test-key-alpha-2026-secret-passphrase-32b-1'
  const KEY_B = 'test-key-beta-2026-secret-passphrase-32b-2'
  const SECRET_PAYLOAD = 'ya29.a0AfH6SMD-google-oauth-access-token-sample-value-12345'
  const REFRESH_PAYLOAD = '1//0gXYZ-google-oauth-refresh-token-sample-value-67890'

  // =========================================================================
  // SECTION 1: UNIT TESTS — CRYPTOGRAPHIC PRIMITIVES & PRODUCTION SAFETY
  // =========================================================================
  console.log('--- SECTION 1: UNIT TESTS — PRIMITIVES & PRODUCTION SAFETY ---')

  // CRYPTO-001: Encrypt with Key A -> Decrypt with Key A
  const cipherA = encryptWithKey(SECRET_PAYLOAD, KEY_A)
  const decryptedA = decryptWithKey(cipherA, KEY_A)
  verify('CRYPTO-001', 'Encrypt with Key A -> Decrypt with Key A recovers original plaintext',
    decryptedA === SECRET_PAYLOAD)

  // CRYPTO-002: Encrypt with Key A -> Decrypt with Key B fails
  let keyMismatchFailed = false
  try {
    decryptWithKey(cipherA, KEY_B)
  } catch {
    keyMismatchFailed = true
  }
  verify('CRYPTO-002', 'Encrypt with Key A -> Decrypt with Key B fails (AES-256-GCM auth tag verification)',
    keyMismatchFailed)

  // CRYPTO-003: Encrypt with Key A -> Decrypt with fallback A succeeds
  const fallbackResult = decryptWithFallback(cipherA, KEY_B, KEY_A)
  verify('CRYPTO-003', 'Encrypt with Key A -> Decrypt with Primary B + Fallback A succeeds via fallback',
    fallbackResult.plaintext === SECRET_PAYLOAD && fallbackResult.keyUsed === 'fallback')

  // CRYPTO-004: Encrypt with Key A -> Re-encrypt with Key B -> Decrypt with Key B
  const cipherB = encryptWithKey(fallbackResult.plaintext, KEY_B)
  const decryptedB = decryptWithKey(cipherB, KEY_B)
  verify('CRYPTO-004', 'Encrypt with Key A -> Re-encrypt with Key B -> Decrypt with Key B succeeds',
    decryptedB === SECRET_PAYLOAD)

  // CRYPTO-005: Corrupted ciphertext is rejected
  let corruptedPartsFailed = false
  let tamperedCipherFailed = false
  let invalidIvFailed = false

  try {
    decryptWithKey('invalid-ciphertext-shape', KEY_A)
  } catch {
    corruptedPartsFailed = true
  }

  try {
    const parts = cipherA.split(':')
    const tampered = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -2)}00`
    decryptWithKey(tampered, KEY_A)
  } catch {
    tamperedCipherFailed = true
  }

  try {
    decryptWithKey('0011223344556677:00112233445566778899aabbccddeeff:aabbcc', KEY_A)
  } catch {
    invalidIvFailed = true
  }

  verify('CRYPTO-005', 'Corrupted ciphertext, tampered payload, or invalid IV lengths are rejected',
    corruptedPartsFailed && tamperedCipherFailed && invalidIvFailed)

  // CRYPTO-006: Invalid key length/format is rejected
  let emptyKeyRejected = false
  try {
    deriveKeyBuffer('')
  } catch {
    emptyKeyRejected = true
  }
  verify('CRYPTO-006', 'Empty or non-string encryption keys are strictly rejected', emptyKeyRejected)

  // CRYPTO-006b: Token pair encryption and decryption preserves both tokens
  const tokenPairEnc = encryptTokenPair(SECRET_PAYLOAD, REFRESH_PAYLOAD, KEY_A)
  const tokenPairDec = decryptTokenPair(tokenPairEnc.accessTokenEnc, tokenPairEnc.refreshTokenEnc, KEY_A)
  verify('CRYPTO-006b', 'Token pair encryption and decryption preserves both access and refresh tokens',
    tokenPairDec.accessToken === SECRET_PAYLOAD && tokenPairDec.refreshToken === REFRESH_PAYLOAD)

  // CRYPTO-014: Production mode fails closed when TOKEN_ENCRYPTION_KEY is absent
  const originalNodeEnv = process.env.NODE_ENV
  const originalTokenKey = process.env.TOKEN_ENCRYPTION_KEY
  let prodFailClosedPassed = false

  try {
    ;(process.env as any).NODE_ENV = 'production'
    delete process.env.TOKEN_ENCRYPTION_KEY
    try {
      getActiveEncryptionKey()
    } catch (err: any) {
      if (err.message.includes('TOKEN_ENCRYPTION_KEY environment variable is required in production')) {
        prodFailClosedPassed = true
      }
    }
  } finally {
    ;(process.env as any).NODE_ENV = originalNodeEnv
    if (originalTokenKey !== undefined) {
      process.env.TOKEN_ENCRYPTION_KEY = originalTokenKey
    } else {
      delete process.env.TOKEN_ENCRYPTION_KEY
    }
  }

  verify('CRYPTO-014', 'Production mode (NODE_ENV=production) fails closed when TOKEN_ENCRYPTION_KEY is missing',
    prodFailClosedPassed)

  // =========================================================================
  // SECTION 2: UNIT TESTS — CLI ARGUMENT & SECRET VALIDATION
  // =========================================================================
  console.log('\n--- SECTION 2: UNIT TESTS — CLI ARGUMENT & SECRET VALIDATION ---')

  // CRYPTO-011: Rejects missing OLD_ENCRYPTION_KEY
  let missingOldKeyRejected = false
  try {
    await runKeyRotation({
      oldKey: '',
      newKey: KEY_B,
      isLive: false,
    })
  } catch (err: any) {
    if (err.message.includes('OLD_ENCRYPTION_KEY must be a non-empty string')) {
      missingOldKeyRejected = true
    }
  }
  verify('CRYPTO-011', 'Rotation runner rejects missing or empty OLD_ENCRYPTION_KEY before DB connection',
    missingOldKeyRejected)

  // CRYPTO-012: Rejects missing NEW_ENCRYPTION_KEY
  let missingNewKeyRejected = false
  try {
    await runKeyRotation({
      oldKey: KEY_A,
      newKey: '',
      isLive: false,
    })
  } catch (err: any) {
    if (err.message.includes('NEW_ENCRYPTION_KEY must be a non-empty string')) {
      missingNewKeyRejected = true
    }
  }
  verify('CRYPTO-012', 'Rotation runner rejects missing or empty NEW_ENCRYPTION_KEY before DB connection',
    missingNewKeyRejected)

  // CRYPTO-013: CLI rejects --old-key / --new-key style secret arguments
  let secretFlagOldRejected = false
  let secretFlagNewRejected = false
  try {
    validateCliArgs(['--dry-run', '--old-key', 'secret_val'])
  } catch (err: any) {
    if (err.message.includes('Passing encryption keys via CLI flags')) {
      secretFlagOldRejected = true
    }
  }
  try {
    validateCliArgs(['--live', '--new-key', 'secret_val'])
  } catch (err: any) {
    if (err.message.includes('Passing encryption keys via CLI flags')) {
      secretFlagNewRejected = true
    }
  }
  verify('CRYPTO-013', 'CLI validator strictly forbids passing secrets via --old-key or --new-key flags',
    secretFlagOldRejected && secretFlagNewRejected)

  // Operational flag exclusivity validation
  let missingModeRejected = false
  let dualModeRejected = false
  try {
    validateCliArgs([])
  } catch {
    missingModeRejected = true
  }
  try {
    validateCliArgs(['--dry-run', '--live'])
  } catch {
    dualModeRejected = true
  }
  verify('CRYPTO-013b', 'CLI validator requires exactly one operational mode (--dry-run or --live)',
    missingModeRejected && dualModeRejected)

  // =========================================================================
  // SECTION 3: MOCK TRANSACTION TESTS — ROTATION LIFECYCLE & INVARIANTS
  // =========================================================================
  console.log('\n--- SECTION 3: MOCK TRANSACTION TESTS — ROTATION & SAFETY ---')

  interface MockOAuthToken {
    id: string
    businessId: string
    provider: string
    accessTokenEnc: string
    refreshTokenEnc: string
    expiresAt: Date | null
    scopes: string
  }

  interface MockAuditLog {
    action: string
    actorId: string
    metadata: string
  }

  function createMockPrisma(initialTokens: MockOAuthToken[], shouldSimulateCommitError = false) {
    const tokensStore: MockOAuthToken[] = initialTokens.map(t => ({ ...t }))
    const auditLogs: MockAuditLog[] = []
    let writeCount = 0

    return {
      store: tokensStore,
      auditLogs,
      getWriteCount: () => writeCount,
      prismaClient: {
        oAuthToken: {
          findMany: async () => tokensStore.map(t => ({ ...t })),
        },
        $transaction: async (fn: (tx: any) => Promise<any>) => {
          const snapshot = tokensStore.map(t => ({ ...t }))
          const auditSnapshot = auditLogs.map(a => ({ ...a }))
          let txWrites = 0

          const tx = {
            oAuthToken: {
              update: async ({ where, data }: { where: { id: string }; data: any }) => {
                const target = tokensStore.find(t => t.id === where.id)
                if (!target) throw new Error(`Token ${where.id} not found`)
                if (data.accessTokenEnc) target.accessTokenEnc = data.accessTokenEnc
                if (data.refreshTokenEnc) target.refreshTokenEnc = data.refreshTokenEnc
                txWrites++
              },
            },
            auditLog: {
              create: async ({ data }: { data: any }) => {
                if (shouldSimulateCommitError) {
                  throw new Error('Simulated PostgreSQL transaction error on audit log create')
                }
                auditLogs.push(data)
              },
            },
          }

          try {
            const result = await fn(tx)
            writeCount += txWrites
            return result
          } catch (txErr) {
            // Rollback in-memory state on transaction exception
            tokensStore.length = 0
            tokensStore.push(...snapshot)
            auditLogs.length = 0
            auditLogs.push(...auditSnapshot)
            throw txErr
          }
        },
      } as any,
    }
  }

  const sampleTokens: MockOAuthToken[] = [
    {
      id: 'tok_google_01',
      businessId: 'biz_01',
      provider: 'google',
      accessTokenEnc: encryptWithKey('token-g1-access', KEY_A),
      refreshTokenEnc: encryptWithKey('token-g1-refresh', KEY_A),
      expiresAt: new Date(Date.now() + 3600000),
      scopes: 'https://www.googleapis.com/auth/business.manage',
    },
    {
      id: 'tok_facebook_02',
      businessId: 'biz_01',
      provider: 'facebook',
      accessTokenEnc: encryptWithKey('token-fb2-access', KEY_A),
      refreshTokenEnc: encryptWithKey('token-fb2-refresh', KEY_A),
      expiresAt: null,
      scopes: 'pages_read_engagement,pages_manage_engagement',
    },
  ]

  // CRYPTO-007: Dry-run performs zero database writes
  const mockDry = createMockPrisma(sampleTokens)
  const dryResult = await runKeyRotation({
    oldKey: KEY_A,
    newKey: KEY_B,
    isLive: false,
    prismaClient: mockDry.prismaClient,
  })

  verify('CRYPTO-007', 'Dry-run evaluates tokens, detects required rotation, and performs 0 database writes',
    dryResult.totalTokens === 2 &&
    dryResult.requiresRotation === 2 &&
    dryResult.databaseWrites === 0 &&
    dryResult.committed === false &&
    mockDry.getWriteCount() === 0)

  // CRYPTO-008: Rotation does not expose plaintext secrets
  const dryResultString = JSON.stringify(dryResult)
  verify('CRYPTO-008', 'Rotation runner returns only aggregate metadata without leaking plaintext tokens',
    !dryResultString.includes('token-g1-access') &&
    !dryResultString.includes('token-fb2-access') &&
    !dryResultString.includes(KEY_A) &&
    !dryResultString.includes(KEY_B))

  // CRYPTO-015: Preflight failure causes zero OAuthToken writes
  const corruptTokens: MockOAuthToken[] = [
    ...sampleTokens,
    {
      id: 'tok_corrupt_03',
      businessId: 'biz_02',
      provider: 'google',
      accessTokenEnc: 'invalid:iv:ciphertext',
      refreshTokenEnc: 'invalid:iv:ciphertext',
      expiresAt: null,
      scopes: '',
    },
  ]

  const mockPreflightFail = createMockPrisma(corruptTokens)
  let preflightHalted = false

  try {
    await runKeyRotation({
      oldKey: KEY_A,
      newKey: KEY_B,
      isLive: true,
      prismaClient: mockPreflightFail.prismaClient,
    })
  } catch (err: any) {
    if (err.message.includes('Key rotation aborted during preflight')) {
      preflightHalted = true
    }
  }

  verify('CRYPTO-015', 'Preflight failure aborts before transaction entry with zero database writes',
    preflightHalted && mockPreflightFail.getWriteCount() === 0)

  // CRYPTO-016: Transaction failure rolls back all changes in mock store (Atomicity & Rollback Safety)
  const mockTxFail = createMockPrisma(sampleTokens, true) // Simulated commit crash on auditLog
  let txRollbackCaught = false
  let thrownTxError: Error | null = null

  try {
    await runKeyRotation({
      oldKey: KEY_A,
      newKey: KEY_B,
      isLive: true,
      prismaClient: mockTxFail.prismaClient,
    })
  } catch (err: any) {
    thrownTxError = err
    if (err.message === 'Key rotation transaction failed and was rolled back completely.') {
      txRollbackCaught = true
    }
  }

  // Verify rollback: state in mock store matches original sampleTokens
  const storeRolledBack = mockTxFail.store.every((t, i) =>
    t.accessTokenEnc === sampleTokens[i].accessTokenEnc &&
    t.refreshTokenEnc === sampleTokens[i].refreshTokenEnc
  )

  verify('CRYPTO-016', 'Transaction failure rolls back changes completely in mock store leaving 0 committed writes',
    txRollbackCaught &&
    storeRolledBack &&
    mockTxFail.auditLogs.length === 0 &&
    mockTxFail.getWriteCount() === 0)

  // CRYPTO-018: Error sanitization prevents database implementation & secret leakage
  const txErrorMessage = thrownTxError?.message || ''
  const isGenericSafeError = txErrorMessage === 'Key rotation transaction failed and was rolled back completely.'
  const hidesSimulatedDbDetails = !txErrorMessage.includes('Simulated PostgreSQL transaction error')
  const hidesKeysAndTokens =
    !txErrorMessage.includes(KEY_A) &&
    !txErrorMessage.includes(KEY_B) &&
    !txErrorMessage.includes('token-g1-access')

  verify('CRYPTO-018', 'Simulated transaction failure produces generic safe error without exposing raw DB errors or secrets',
    isGenericSafeError && hidesSimulatedDbDetails && hidesKeysAndTokens)

  // CRYPTO-009 & CRYPTO-010: Rotation is safely repeatable/idempotent under successful commit
  const mockLive = createMockPrisma(sampleTokens)

  // Run 1: Migrate Key A -> Key B
  const liveResult1 = await runKeyRotation({
    oldKey: KEY_A,
    newKey: KEY_B,
    isLive: true,
    prismaClient: mockLive.prismaClient,
  })

  // Verify all tokens in store now decrypt with Key B
  const allDecryptedWithB = mockLive.store.every(t => {
    try {
      const a = decryptWithKey(t.accessTokenEnc, KEY_B)
      const r = decryptWithKey(t.refreshTokenEnc, KEY_B)
      return a.startsWith('token-') && r.startsWith('token-')
    } catch {
      return false
    }
  })

  // Run 2: Re-run when tokens are already under Key B
  const liveResult2 = await runKeyRotation({
    oldKey: KEY_A,
    newKey: KEY_B,
    isLive: true,
    prismaClient: mockLive.prismaClient,
  })

  verify('CRYPTO-009', 'Successful live rotation commits updates and creates security audit log entry',
    liveResult1.committed &&
    liveResult1.databaseWrites === 2 &&
    allDecryptedWithB &&
    mockLive.auditLogs.length === 1 &&
    mockLive.auditLogs[0].action === 'security.tokens_reencrypted')

  verify('CRYPTO-010', 'Rotation is safely repeatable/idempotent: second run performs 0 writes',
    liveResult2.alreadyUsingNewKey === 2 &&
    liveResult2.requiresRotation === 0 &&
    liveResult2.databaseWrites === 0)

  // CRYPTO-017: No test output contains any test secret
  const allTestOutput = JSON.stringify({ liveResult1, liveResult2, dryResult, txErrorMessage })
  verify('CRYPTO-017', 'Test suite assertions and results do not log any secret keys or token values',
    !allTestOutput.includes(SECRET_PAYLOAD) &&
    !allTestOutput.includes(REFRESH_PAYLOAD) &&
    !allTestOutput.includes(KEY_A) &&
    !allTestOutput.includes(KEY_B))

  console.log('\n=================================================================')
  console.log(`STAGE 2C CRYPTO TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('=================================================================\n')

  if (failed > 0) process.exit(1)
}

runStage2CTests().catch(err => {
  console.error('Stage 2C test fatal error:', err)
  process.exit(1)
})
