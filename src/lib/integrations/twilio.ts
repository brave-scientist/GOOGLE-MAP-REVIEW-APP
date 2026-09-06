// lib/integrations/twilio.ts — Real Twilio SMS integration
// Requires env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER

/**
 * @deprecated Direct provider dispatch is forbidden.
 * All SMS dispatches must go through SmsService.sendSms() to enforce
 * affirmative consent, opt-out checking, cooldowns, quotas, and audit logs.
 */
export async function sendSMS(to: string, body: string): Promise<{
  success: boolean
  messageId?: string
  error?: string
}> {
  return {
    success: false,
    error: 'Direct SMS provider dispatch is forbidden. All dispatches must use SmsService.sendSms() with businessId context.',
  }
}

export function isTwilioConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER)
}

export function isStopKeyword(text: string): boolean {
  const stopKeywords = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']
  const normalized = text.trim().toUpperCase()
  return stopKeywords.includes(normalized)
}

export function isStartKeyword(text: string): boolean {
  const startKeywords = ['START', 'YES', 'UNSTOP']
  const normalized = text.trim().toUpperCase()
  return startKeywords.includes(normalized)
}
