/**
 * lib/integrations/twilio.ts
 *
 * Per Implementation-Plan §1: all Twilio (SMS) API calls live here.
 *
 * Mock mode (USE_MOCKS=true, default): does NOT send a real SMS. Instead logs
 * the fully-rendered message to the server log and marks the send successful,
 * so the review-request flow is testable end-to-end without real delivery.
 *
 * PII (Data-Handling-Policy.md 2.3): the destination phone number is PII. The
 * mock log redacts it to last-4. Message body is logged because it is rendered
 * from the business's own template (business content, not end-customer PII),
 * but the customer's contact number itself is never logged in full.
 */

const USE_MOCKS = process.env.USE_MOCKS !== "false";

export interface SendSmsResult {
  success: boolean;
  provider_message_id?: string;
  error_message?: string;
}

/**
 * Send an SMS via Twilio.
 * Real signature: (to, body).
 */
export async function sendSms(to: string, body: string): Promise<SendSmsResult> {
  if (USE_MOCKS || !process.env.TWILIO_ACCOUNT_SID) {
    await delay(100);
    const redacted = to.length > 4 ? `***-***-${to.slice(-4)}` : "***";
    console.log(`[mock:twilio] SMS to ${redacted}:\n${body}`);
    return { success: true, provider_message_id: `mock-twilio-${Date.now()}` };
  }

  // ---- REAL implementation -------------------------------------------------
  // POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
  // Basic auth with TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN.
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_PHONE_NUMBER!;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    return { success: false, error_message: `twilio ${res.status}: ${text}` };
  }
  const json = (await res.json()) as { sid?: string };
  return { success: true, provider_message_id: json.sid };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}