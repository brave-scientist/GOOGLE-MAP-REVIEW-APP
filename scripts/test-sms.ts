// scripts/test-sms.ts — Comprehensive Test Suite for SMS-001 Telnyx Foundation
import crypto from 'crypto'
import {
  SmsService,
  TelnyxAdapter,
  TwilioAdapter,
  validateAndNormalizePhone,
  buildReviewRequestSms,
  SMS_LIMITS,
} from '../src/lib/sms'
import { isStopKeyword, isStartKeyword } from '../src/lib/integrations/twilio'

let totalTests = 0
let passedTests = 0
let failedTests = 0

function assert(condition: boolean, testId: string, description: string) {
  totalTests++
  if (condition) {
    passedTests++
    console.log(`  ✓ [${testId}] PASS: ${description}`)
  } else {
    failedTests++
    console.error(`  ✗ [${testId}] FAIL: ${description}`)
  }
}

async function runTests() {
  console.log('\n=================================================================')
  console.log('SMS-001 — TELNYX SMS FOUNDATION & COMPLIANCE VERIFICATION')
  console.log('=================================================================\n')

  // --- SECTION 1: PHONE NORMALIZATION & E.164 ---
  console.log('--- SECTION 1: PHONE NORMALIZATION & E.164 (libphonenumber-js) ---')

  const usNum = validateAndNormalizePhone('(415) 555-2671', 'US')
  assert(usNum.valid && usNum.e164 === '+14155552671', 'PHONE-001', 'US 10-digit format normalizes to standard +1 E.164')

  const caNum = validateAndNormalizePhone('+1 604 555 0199', 'CA')
  assert(caNum.valid && caNum.e164 === '+16045550199', 'PHONE-002', 'Canada number with +1 prefix preserves E.164')

  const ukNum = validateAndNormalizePhone('07911 123456', 'GB')
  assert(ukNum.valid && ukNum.e164 === '+447911123456', 'PHONE-003', 'UK mobile number normalizes to +44 E.164')

  const auNum = validateAndNormalizePhone('0412 345 678', 'AU')
  assert(auNum.valid && auNum.e164 === '+61412345678', 'PHONE-004', 'Australia mobile number normalizes to +61 E.164')

  const malformed = validateAndNormalizePhone('12345', 'US')
  assert(!malformed.valid, 'PHONE-005', 'Malformed short numbers are rejected')

  const emptyNum = validateAndNormalizePhone('', 'US')
  assert(!emptyNum.valid, 'PHONE-006', 'Empty phone input is rejected with clear error')

  const nullNum = validateAndNormalizePhone(null, 'US')
  assert(!nullNum.valid, 'PHONE-007', 'Null/undefined input fails gracefully without throwing')

  // --- SECTION 2: REGULATORY COMPLIANCE & TEMPLATES ---
  console.log('\n--- SECTION 2: REGULATORY COMPLIANCE & TEMPLATES ---')

  const smsText = buildReviewRequestSms({
    customerName: 'Alex',
    businessName: 'Bamboo Garden',
    reviewUrl: 'https://reviewreply.pw/review-us/bamboo-garden',
  })

  assert(smsText.includes('Bamboo Garden'), 'COMPL-001', 'Template explicitly identifies the sending business')
  assert(smsText.includes('https://reviewreply.pw/review-us/bamboo-garden'), 'COMPL-002', 'Template contains neutral review URL')
  assert(smsText.includes('Reply STOP to opt out'), 'COMPL-003', 'Template includes mandatory STOP opt-out instructions')
  assert(smsText.includes('HELP for help'), 'COMPL-004', 'Template includes mandatory HELP instructions')
  assert(!smsText.toLowerCase().includes('5-star') && !smsText.toLowerCase().includes('good experience'), 'COMPL-005', 'Template contains zero sentiment gating or rating filters')

  // --- SECTION 3: KEYWORD PARSER (STOP/START/HELP) ---
  console.log('\n--- SECTION 3: INBOUND KEYWORD PARSER ---')

  assert(isStopKeyword('STOP'), 'KEYWORD-001', 'Recognizes "STOP"')
  assert(isStopKeyword('  stop  '), 'KEYWORD-002', 'Recognizes lowercase "stop" with whitespace')
  assert(isStopKeyword('CANCEL') && isStopKeyword('QUIT') && isStopKeyword('UNSUBSCRIBE') && isStopKeyword('END'), 'KEYWORD-003', 'Recognizes CANCEL, QUIT, UNSUBSCRIBE, and END')
  assert(isStartKeyword('START') && isStartKeyword('YES') && isStartKeyword('UNSTOP'), 'KEYWORD-004', 'Recognizes START, YES, and UNSTOP')
  assert(!isStopKeyword('hello there') && !isStartKeyword('random message'), 'KEYWORD-005', 'Arbitrary text is not falsely classified as opt-in/opt-out')

  // --- SECTION 4: ED25519 WEBHOOK SECURITY & REPLAY PROTECTION ---
  console.log('\n--- SECTION 4: ED25519 WEBHOOK SECURITY & REPLAY PROTECTION ---')

  const telnyx = new TelnyxAdapter()

  // Generate an ephemeral Ed25519 keypair for cryptographic testing
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const rawPubDer = publicKey.export({ format: 'der', type: 'spki' })
  // Extract 32-byte raw Ed25519 public key (skip 12-byte header)
  const rawPubKeyBase64 = rawPubDer.subarray(12).toString('base64')

  const origKey = process.env.TELNYX_PUBLIC_KEY
  process.env.TELNYX_PUBLIC_KEY = rawPubKeyBase64

  const testPayload = JSON.stringify({
    data: {
      event_type: 'message.delivered',
      id: 'evt_test_123',
      occurred_at: new Date().toISOString(),
      payload: {
        id: 'msg_3ca7b3d1',
        direction: 'outbound',
        to: [{ phone_number: '+14155552671', status: 'delivered' }],
      },
    },
  })

  const currentTs = Math.floor(Date.now() / 1000).toString()
  const signedPayload = Buffer.from(`${currentTs}.${testPayload}`, 'utf8')
  const validSig = crypto.sign(null, signedPayload, privateKey).toString('base64')

  const validHeaders = new Headers({
    'telnyx-signature-ed25519': validSig,
    'telnyx-timestamp': currentTs,
  })

  assert(telnyx.verifyWebhook(testPayload, validHeaders), 'CRYPTO-001', 'Valid Ed25519 signature and fresh timestamp verify successfully')

  const invalidHeaders = new Headers({
    'telnyx-signature-ed25519': Buffer.from('invalid-signature-bytes-which-should-fail-verification-test').toString('base64'),
    'telnyx-timestamp': currentTs,
  })
  assert(!telnyx.verifyWebhook(testPayload, invalidHeaders), 'CRYPTO-002', 'Tampered signature is rejected (HTTP 403)')

  const staleTs = (Math.floor(Date.now() / 1000) - 400).toString() // 400s old > 300s limit
  const staleSignedPayload = Buffer.from(`${staleTs}.${testPayload}`, 'utf8')
  const staleSig = crypto.sign(null, staleSignedPayload, privateKey).toString('base64')

  const staleHeaders = new Headers({
    'telnyx-signature-ed25519': staleSig,
    'telnyx-timestamp': staleTs,
  })
  assert(!telnyx.verifyWebhook(testPayload, staleHeaders), 'CRYPTO-003', 'Stale webhook timestamp (>300s) is rejected for replay prevention')

  delete process.env.TELNYX_PUBLIC_KEY
  assert(!telnyx.verifyWebhook(testPayload, validHeaders), 'CRYPTO-004', 'Missing TELNYX_PUBLIC_KEY fails closed (HTTP 403)')
  process.env.TELNYX_PUBLIC_KEY = origKey

  // --- SECTION 5: WEBHOOK PAYLOAD PARSER ---
  console.log('\n--- SECTION 5: WEBHOOK PAYLOAD NORMALIZATION ---')

  const parsedDelivered = telnyx.parseWebhook(testPayload)
  assert(
    parsedDelivered?.type === 'outbound.delivered' &&
    parsedDelivered?.providerMessageId === 'msg_3ca7b3d1' &&
    parsedDelivered?.provider === 'telnyx',
    'PARSE-001',
    'Telnyx message.delivered payload parses to normalized outbound.delivered event'
  )

  const inboundJson = JSON.stringify({
    data: {
      event_type: 'message.received',
      id: 'evt_inbound_456',
      payload: {
        id: 'msg_inbound_789',
        direction: 'inbound',
        from: { phone_number: '+14155552671' },
        to: [{ phone_number: '+18005550199', status: 'delivered' }],
        text: 'STOP',
      },
    },
  })
  const parsedInbound = telnyx.parseWebhook(inboundJson)
  assert(
    parsedInbound?.type === 'inbound.received' &&
    parsedInbound?.body === 'STOP' &&
    parsedInbound?.from === '+14155552671',
    'PARSE-002',
    'Inbound Telnyx message parses correctly with sender number and text'
  )

  // --- SECTION 6: SERVICE SAFETY & DEFAULTS ---
  console.log('\n--- SECTION 6: SERVICE SAFETY & FAIL-SAFE CONTROLS ---')

  const origFlag = process.env.FEATURE_SMS_ENABLED
  delete process.env.FEATURE_SMS_ENABLED // Simulate default unconfigured state

  const safeSend = await SmsService.sendSms({
    to: '+14155552671',
    body: 'Test',
    businessId: 'mock_bus_1',
  })

  assert(!safeSend.success && safeSend.errorCode === 'FEATURE_DISABLED', 'SAFETY-001', 'When FEATURE_SMS_ENABLED is false/unset, SmsService fails closed without sending')
  process.env.FEATURE_SMS_ENABLED = origFlag

  const activeProvider = SmsService.getProvider()
  assert(activeProvider.name === 'telnyx', 'PROV-001', 'Default provider resolves to TelnyxAdapter')

  process.env.SMS_PROVIDER = 'twilio'
  assert(SmsService.getProvider().name === 'twilio', 'PROV-002', 'Provider switches to TwilioAdapter when SMS_PROVIDER=twilio')
  delete process.env.SMS_PROVIDER

  console.log('\n=================================================================')
  console.log(`SMS TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`)
  console.log('=================================================================\n')

  if (failedTests > 0) {
    process.exit(1)
  }
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err)
  process.exit(1)
})
