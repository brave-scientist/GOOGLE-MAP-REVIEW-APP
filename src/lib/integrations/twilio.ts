// lib/integrations/twilio.ts — Real Twilio SMS integration
// Requires env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER

export async function sendSMS(to: string, body: string): Promise<{
  success: boolean
  messageId?: string
  error?: string
}> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    return {
      success: false,
      error: 'Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env',
    }
  }

  try {
    let formattedTo = to.trim()
    if (!formattedTo.startsWith('+')) {
      formattedTo = `+1${formattedTo.replace(/[^0-9]/g, '')}`
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: formattedTo,
        From: fromNumber,
        Body: body,
      }),
    })

    const data = await response.json()

    if (response.ok && data.sid) {
      return { success: true, messageId: data.sid }
    } else {
      return { success: false, error: data.message || 'Twilio API error' }
    }
  } catch (error) {
    return { success: false, error: String(error) }
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
