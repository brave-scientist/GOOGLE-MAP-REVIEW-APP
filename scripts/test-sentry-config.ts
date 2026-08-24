// scripts/test-sentry-config.ts — Safe unit verification for OBS-001 Sentry configuration
//
// Verifies:
// 1. Sentry configuration files exist and export valid configurations.
// 2. Sentry initialization is a safe no-op when SENTRY_DSN is absent.
// 3. Sentry configuration respects sampling rate and environment constraints.
// 4. Zero secret values or DSN strings are logged or hardcoded.

import fs from 'fs'
import path from 'path'

function runSentryTests() {
  console.log('=================================================================')
  console.log('OBS-001 — SENTRY OBSERVABILITY CONFIGURATION VERIFICATION')
  console.log('=================================================================\n')

  let passed = 0
  let failed = 0

  function verify(id: string, name: string, condition: boolean, details?: string) {
    if (condition) {
      console.log(`  ✓ [${id}] PASS: ${name}`)
      passed++
    } else {
      console.error(`  ✗ [${id}] FAIL: ${name}${details ? ` -> ${details}` : ''}`)
      failed++
    }
  }

  const rootDir = process.cwd()

  // 1. Verify existence of configuration files
  const clientConfigPath = path.join(rootDir, 'sentry.client.config.ts')
  const serverConfigPath = path.join(rootDir, 'sentry.server.config.ts')
  const edgeConfigPath = path.join(rootDir, 'sentry.edge.config.ts')
  const nextConfigPath = path.join(rootDir, 'next.config.ts')

  verify('SENTRY-001', 'sentry.client.config.ts exists', fs.existsSync(clientConfigPath))
  verify('SENTRY-002', 'sentry.server.config.ts exists', fs.existsSync(serverConfigPath))
  verify('SENTRY-003', 'sentry.edge.config.ts exists', fs.existsSync(edgeConfigPath))
  verify('SENTRY-004', 'next.config.ts exists', fs.existsSync(nextConfigPath))

  // 2. Read and verify client config guards
  const clientContent = fs.readFileSync(clientConfigPath, 'utf8')
  verify('SENTRY-005', 'Client config guards initialization behind DSN presence check',
    clientContent.includes('if (SENTRY_DSN)') || clientContent.includes('if (process.env.SENTRY_DSN)'))
  verify('SENTRY-006', 'Client config defines tracesSampleRate within free tier budget (<= 0.1)',
    clientContent.includes('tracesSampleRate: 0.1'))
  verify('SENTRY-007', 'Client config excludes localhost telemetry',
    clientContent.includes('denyUrls:') && clientContent.includes('localhost'))

  // 3. Read and verify server config guards
  const serverContent = fs.readFileSync(serverConfigPath, 'utf8')
  verify('SENTRY-008', 'Server config guards initialization behind DSN presence check',
    serverContent.includes('if (SENTRY_DSN)'))
  verify('SENTRY-009', 'Server config defines tracesSampleRate within budget (<= 0.1)',
    serverContent.includes('tracesSampleRate: 0.1'))

  // 4. Read and verify edge config guards
  const edgeContent = fs.readFileSync(edgeConfigPath, 'utf8')
  verify('SENTRY-010', 'Edge config guards initialization behind DSN presence check',
    edgeContent.includes('if (SENTRY_DSN)'))
  verify('SENTRY-011', 'Edge config defines tracesSampleRate within budget (<= 0.1)',
    edgeContent.includes('tracesSampleRate: 0.1'))

  // 5. Read and verify next.config.ts Sentry wrapper
  const nextConfigContent = fs.readFileSync(nextConfigPath, 'utf8')
  verify('SENTRY-012', 'next.config.ts wraps export with withSentryConfig',
    nextConfigContent.includes('withSentryConfig('))
  verify('SENTRY-013', 'next.config.ts sets silent: true for clean build when DSN is absent',
    nextConfigContent.includes('silent: true'))
  verify('SENTRY-014', 'next.config.ts disables sourcemaps in non-production environments',
    nextConfigContent.includes("disable: process.env.NODE_ENV !== 'production'"))

  // 6. Security scan: confirm no hardcoded credentials exist in config files
  const forbiddenPatterns = [
    /https:\/\/[a-f0-9]+@o\d+\.ingest\.sentry\.io/,
    /sntrys_[a-zA-Z0-9_-]+/,
    /sk_live_[a-zA-Z0-9]+/,
    /whsec_[a-zA-Z0-9]+/
  ]

  let leakedSecrets = false
  for (const fileContent of [clientContent, serverContent, edgeContent, nextConfigContent]) {
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(fileContent)) {
        leakedSecrets = true
      }
    }
  }
  verify('SENTRY-015', 'Sentry configuration files contain zero hardcoded secrets or production DSNs',
    !leakedSecrets)

  console.log('\n=================================================================')
  console.log(`SENTRY CONFIGURATION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('=================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runSentryTests()
