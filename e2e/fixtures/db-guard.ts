/**
 * E2E Database Safety Guard (Milestone 2D / TEST-002)
 *
 * Enforces strict fail-closed validation for the E2E database connection string.
 * Prevents accidental connection to production, staging, or any non-isolated database.
 */

export const DEFAULT_E2E_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5433/reviewreply_test?schema=public'

/**
 * Validate that a database URL strictly targets the isolated local test database.
 * NEVER allows cloud providers, non-local hosts, non-test database names, or production markers.
 */
export function validateE2EDatabaseUrl(rawUrl?: string): string {
  // If explicitly unset, default to the local isolated test DB
  const url = rawUrl || DEFAULT_E2E_DATABASE_URL

  if (!url || typeof url !== 'string' || url.trim() === '') {
    throw new Error('[FAIL-CLOSED] E2E_DATABASE_URL must be defined and non-empty.')
  }

  const trimmed = url.trim()
  const lower = trimmed.toLowerCase()

  // 1. Must target localhost or 127.0.0.1 on port 5433
  const isLocalHostAndPort =
    lower.includes('localhost:5433') || lower.includes('127.0.0.1:5433')

  // 2. Must target the test database name 'reviewreply_test'
  const isTestDb = lower.includes('/reviewreply_test')

  // 3. Must NOT contain any remote, cloud, or production signatures
  const containsCloudOrProd =
    lower.includes('supabase') ||
    lower.includes('neon.tech') ||
    lower.includes('pooler') ||
    lower.includes('aws') ||
    lower.includes('rds') ||
    lower.includes('reviewreply.pw') ||
    lower.includes('production') ||
    lower.includes('prod')

  if (!isLocalHostAndPort || !isTestDb || containsCloudOrProd) {
    throw new Error(
      `[FAIL-CLOSED PRODUCTION SAFETY VIOLATION] Refusing to start E2E tests against unverified database URL: "${trimmed}". ` +
      `E2E tests may ONLY target the local isolated test database on port 5433 with database "reviewreply_test".`
    )
  }

  return trimmed
}

/**
 * Resolves the authoritative E2E database URL strictly from E2E_DATABASE_URL.
 * NEVER reads or falls back to process.env.DATABASE_URL.
 */
export function getAuthoritativeE2EDatabaseUrl(): string {
  // Explicitly ignore process.env.DATABASE_URL
  const candidateUrl = process.env.E2E_DATABASE_URL || DEFAULT_E2E_DATABASE_URL
  return validateE2EDatabaseUrl(candidateUrl)
}
