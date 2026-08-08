// lib/integrations/twilio-webhook.ts — Twilio webhook signature validation
//
// SEC-03: Twilio signs every webhook request with HMAC-SHA1 using the
// account's auth token. Without validating this signature, anyone can POST
// a spoofed STOP/UNSUBSCRIBE message to /api/webhooks/twilio and unsubscribe
// arbitrary phone numbers — a trivial denial-of-service on SMS campaigns.
//
// Validation algorithm (per Twilio's official docs):
//   1. Take the full URL Twilio called (scheme + host + path + query string)
//   2. Sort all POST form parameters alphabetically by key
//   3. Concatenate key+value pairs (no separators, no URL-encoding)
//   4. Prepend the sorted param string to the URL
//   5. HMAC-SHA1 the result with the auth token, base64-encode
//   6. Compare to the X-Twilio-Signature header (timing-safe)
//
// Reference: https://www.twilio.com/docs/usage/webhooks/webhooks-security

import crypto from 'crypto'

/**
 * Validates the X-Twilio-Signature header against the request body and URL.
 *
 * @returns true if the signature is valid, false otherwise (including when
 *          the auth token is unset or the signature is missing).
 */
export function validateTwilioSignature(params: {
  signature: string | null
  url: string
  formData: URLSearchParams
  authToken: string | undefined
}): boolean {
  const { signature, url, formData, authToken } = params

  // Fail closed: if no auth token is configured, we cannot validate.
  // Twilio webhooks are only meaningful when Twilio is configured anyway —
  // a missing token means the route shouldn't accept any webhook.
  if (!authToken) return false
  if (!signature) return false

  // 1. Sort form params alphabetically by key
  const entries = Array.from(formData.entries())
    // Skip empty keys (shouldn't happen, but be defensive)
    .filter(([k]) => k.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))

  // 2. Concatenate key+value pairs (no separators)
  const dataString = entries.map(([k, v]) => `${k}${v}`).join('')

  // 3. Prepend sorted param string to the URL
  const twimlSource = `${url}${dataString}`

  // 4. HMAC-SHA1 with auth token, base64-encoded
  const expected = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(twimlSource, 'utf-8'))
    .digest('base64')

  // 5. Timing-safe comparison
  // Buffer.from handles the base64 lengths consistently; timingSafeEqual
  // requires equal-length buffers so guard against length-mismatch attacks.
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Reconstructs the full URL Twilio called, using the request's host header.
 *
 * In production behind a proxy, you must trust the x-forwarded-proto and
 * x-forwarded-host headers (Next.js handles this if `NEXT_PUBLIC_APP_URL`
 * is set correctly and the deployment platform preserves these headers).
 *
 * For dev/testing, we allow the caller to pass an explicit URL.
 */
export function reconstructTwilioUrl(request: Request): string {
  // If we have a public app URL configured, prefer it — Twilio calls the
  // public URL, not localhost, so the signature is computed against the
  // public URL even if the request arrives via a tunnel.
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL
  if (publicUrl) {
    const url = new URL(request.url)
    const pub = new URL(publicUrl)
    return `${pub.origin}${url.pathname}${url.search}`
  }
  // Fallback: use the request's own URL (works if Twilio is hitting this URL
  // directly — e.g. ngrok dev tunnels where the public URL == request URL)
  return request.url
}
