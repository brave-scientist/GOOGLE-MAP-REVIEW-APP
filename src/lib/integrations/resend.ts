// lib/integrations/resend.ts — Real email integration via Resend
// Requires env var: RESEND_API_KEY

export async function sendEmail(params: {
  to: string
  subject: string
  html?: string
  text?: string
  from?: string
}): Promise<{
  success: boolean
  messageId?: string
  error?: string
}> {
  const apiKey = process.env.RESEND_API_KEY
  const defaultFrom = process.env.RESEND_FROM_EMAIL || 'ReviewReply <noreply@reviewreply.com>'

  if (!apiKey) {
    return {
      success: false,
      error: 'Resend not configured. Set RESEND_API_KEY in .env',
    }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: params.from || defaultFrom,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    })

    const data = await response.json()

    if (response.ok && data.id) {
      return { success: true, messageId: data.id }
    } else {
      return { success: false, error: data.message || 'Resend API error' }
    }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY
}

// Generate an HTML email for review requests
export function generateReviewRequestEmail(params: {
  customerName: string
  businessName: string
  reviewLink: string
  unsubscribeLink: string
}): { html: string; text: string } {
  const { customerName, businessName, reviewLink, unsubscribeLink } = params

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px; background: #f9f9f9;">
  <div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e5e5e5;">
    <h1 style="font-size: 20px; color: #1a1a1a; margin: 0 0 16px 0;">Hi ${customerName},</h1>
    <p style="font-size: 15px; color: #4a4a4a; line-height: 1.6; margin: 0 0 24px 0;">
      Thank you for visiting ${businessName}! We hope you had a great experience.
    </p>
    <p style="font-size: 15px; color: #4a4a4a; line-height: 1.6; margin: 0 0 24px 0;">
      Would you mind taking 30 seconds to leave us a review? It helps us grow and serve you better.
    </p>
    <a href="${reviewLink}" style="display: inline-block; background: #97781B; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; margin: 0 0 24px 0;">
      Leave a Review →
    </a>
    <p style="font-size: 12px; color: #999999; line-height: 1.5; margin: 24px 0 0 0; padding-top: 16px; border-top: 1px solid #f0f0f0;">
      You received this email because you visited ${businessName}. If you don't want to receive these emails, <a href="${unsubscribeLink}" style="color: #999999;">unsubscribe here</a>.
    </p>
  </div>
</body>
</html>`

  const text = `Hi ${customerName},

Thank you for visiting ${businessName}! We hope you had a great experience.

Would you mind taking 30 seconds to leave us a review? It helps us grow and serve you better.

Leave a Review: ${reviewLink}

---
You received this email because you visited ${businessName}. To unsubscribe, visit: ${unsubscribeLink}`

  return { html, text }
}
