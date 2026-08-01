/**
 * lib/integrations/resend.ts
 *
 * Per Implementation-Plan §1: all Resend (transactional email) API calls live here.
 *
 * Mock mode (USE_MOCKS=true, default): does NOT send a real email. Instead logs
 * the fully-rendered message to the server log and marks the send successful.
 *
 * PII (Data-Handling-Policy.md 2.3): the recipient email is PII. The mock log
 * redacts the local part. Subject + body are logged because they are rendered
 * from business-owned templates (e.g. new-review notifications to the owner),
 * but the end-customer's full email address is never logged.
 */

const USE_MOCKS = process.env.USE_MOCKS !== "false";

export interface SendEmailResult {
  success: boolean;
  provider_message_id?: string;
  error_message?: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string; // plain-text body
  html?: string; // optional html body
}

/**
 * Send a transactional email via Resend.
 * Real signature: ({ to, subject, body }).
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (USE_MOCKS || !process.env.RESEND_API_KEY) {
    await delay(100);
    const [local, domain] = input.to.split("@");
    const redacted =
      local && domain
        ? `${local.slice(0, 1)}***@${domain}`
        : "[redacted]";
    console.log(
      `[mock:resend] Email to ${redacted}\nSubject: ${input.subject}\n${input.body}`
    );
    return { success: true, provider_message_id: `mock-resend-${Date.now()}` };
  }

  // ---- REAL implementation -------------------------------------------------
  // POST https://api.resend.com/emails with Authorization: Bearer RESEND_API_KEY
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "ReviewReply-Lite <notifications@reviewreply.app>",
      to: [input.to],
      subject: input.subject,
      text: input.body,
      html: input.html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { success: false, error_message: `resend ${res.status}: ${text}` };
  }
  const json = (await res.json()) as { id?: string };
  return { success: true, provider_message_id: json.id };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}