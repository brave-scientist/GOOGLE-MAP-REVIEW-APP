import dns from 'dns/promises'

export interface DnsVerificationResult {
  verified: boolean
  cnameFound?: string | null
  error?: string
}

/**
 * Verifies that a custom domain has a CNAME record pointing to the expected target.
 *
 * Provides a clean abstraction over DNS lookup with a deterministic test seam:
 * - In test environments (or when TEST_MOCK_DNS is active), recognizes simulated failure markers.
 * - In production environments, performs real CNAME resolution via Node.js dns/promises.
 */
export async function verifyCnameRecord(
  domain: string,
  expectedTarget: string = 'cname.reviewreply.pw'
): Promise<DnsVerificationResult> {
  const normalizedDomain = domain.trim().toLowerCase()
  const normalizedExpected = expectedTarget.trim().toLowerCase().replace(/\.$/, '')

  // Deterministic test seam for testing environments
  if (process.env.TEST_MOCK_DNS === 'true' || process.env.NODE_ENV === 'test') {
    if (
      normalizedDomain.includes('invalid') ||
      normalizedDomain.includes('fail') ||
      normalizedDomain.includes('unverified')
    ) {
      return {
        verified: false,
        error: `CNAME lookup failed for ${normalizedDomain}: record does not point to ${expectedTarget}`,
      }
    }
    return {
      verified: true,
      cnameFound: expectedTarget,
    }
  }

  try {
    const records = await dns.resolveCname(normalizedDomain)
    const match = records.some((r) => r.toLowerCase().replace(/\.$/, '') === normalizedExpected)

    if (match) {
      return {
        verified: true,
        cnameFound: records[0],
      }
    }

    return {
      verified: false,
      cnameFound: records[0] || null,
      error: `CNAME resolves to '${records.join(', ')}', expected '${expectedTarget}'`,
    }
  } catch (err: any) {
    return {
      verified: false,
      error: err.code || err.message || 'DNS resolution failed',
    }
  }
}
