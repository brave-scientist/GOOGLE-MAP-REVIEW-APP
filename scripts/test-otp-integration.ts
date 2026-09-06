// scripts/test-otp-integration.ts — Live PostgreSQL Database Integration Test Suite for EmailOtp
import assert from 'assert'
import crypto from 'crypto'

async function runOtpIntegrationTest() {
  console.log('=================================================================')
  console.log('EMAIL OTP — POSTGRESQL REAL DATABASE INTEGRATION TEST')
  console.log('=================================================================\n')

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl || databaseUrl.trim().length === 0) {
    console.log('[INTEGRATION TEST STATUS: PENDING LIVE DATABASE]')
    console.log('DATABASE_URL environment variable is not configured in local environment.')
    console.log('Live PostgreSQL schema verification will execute automatically upon database provisioning.\n')
    console.log('Summary: 0 executed, 0 failed, 1 pending database connectivity.')
    return
  }

  const { db } = await import('../src/lib/db')

  const testEmail = `remediation_test_${Date.now()}@example.com`
  const rawCode = '849201'
  const otpHash = crypto.createHash('sha256').update(rawCode).digest('hex')
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

  console.log(`Testing against live database for target email: ${testEmail}...`)

  try {
    // 1. Invalidate any pre-existing OTPs
    await db.emailOtp.deleteMany({ where: { email: testEmail } })

    // 2. Persist OTP in PostgreSQL
    const created = await db.emailOtp.create({
      data: {
        email: testEmail,
        otpHash,
        expiresAt,
        isNewUser: true,
        name: 'Test Pilot',
      },
    })
    assert.strictEqual(created.email, testEmail)
    assert.strictEqual(created.otpHash, otpHash)
    console.log('  ✓ PASS: Live DB insert into EmailOtp succeeded')

    // 3. Lookup unconsumed record
    const found = await db.emailOtp.findFirst({
      where: { email: testEmail, consumedAt: null },
    })
    assert.notStrictEqual(found, null)
    assert.strictEqual(found?.otpHash, otpHash)
    console.log('  ✓ PASS: Live DB query by email and consumedAt succeeded')

    // 4. Attempt counting increment
    const updated = await db.emailOtp.update({
      where: { id: created.id },
      data: { attempts: { increment: 1 } },
    })
    assert.strictEqual(updated.attempts, 1)
    console.log('  ✓ PASS: Live DB atomic attempt counter increment succeeded')

    // 5. Single-use deletion upon verification
    await db.emailOtp.delete({
      where: { id: created.id },
    })
    console.log('  ✓ PASS: Live DB atomic record deletion succeeded')

    // 6. Replay prevention check
    const replayed = await db.emailOtp.findFirst({
      where: { email: testEmail, consumedAt: null },
    })
    assert.strictEqual(replayed, null)
    console.log('  ✓ PASS: Live DB replay verification returns null')

    console.log('\n=================================================================')
    console.log('LIVE DATABASE INTEGRATION TEST: ALL 5 STEPS PASSED')
    console.log('=================================================================')
  } catch (err: any) {
    console.error('Live database integration failed:', err.message)
    process.exit(1)
  } finally {
    // Cleanup any lingering records
    await db.emailOtp.deleteMany({ where: { email: testEmail } }).catch(() => {})
  }
}

runOtpIntegrationTest().catch(err => {
  console.error('Test execution exception:', err)
  process.exit(1)
})
