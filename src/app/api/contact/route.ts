import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// SEC-07: Sanitize user input before storing in the audit log.
// The contact form's name/subject/message fields are stored as-is in the
// audit log's `metadata` JSON field. While this field is not currently
// rendered as HTML anywhere in the app, storing raw user input is still
// risky because:
//   1. A future admin view might render metadata as HTML (XSS payload survives)
//   2. JSON.stringify doesn't escape <script> tags — they appear verbatim
//   3. It pollutes the audit log with injection-attempt evidence that's
//      harder to read
// We strip HTML tags and limit length, then store the cleaned version.
// The raw input is NOT needed for any legitimate purpose in the audit log.
function sanitizeForLog(value: string, maxLen = 2000): string {
  if (!value) return ''
  // Strip anything that looks like an HTML tag (including <script>, <img onerror=, etc.)
  // This is intentionally aggressive — the audit log doesn't need HTML, so we
  // remove all <...> sequences, not just known-dangerous tags.
  const stripped = value.replace(/<[^>]*>/g, '')
  // Limit length to prevent log-bombing via huge inputs
  return stripped.length > maxLen ? stripped.slice(0, maxLen) + '…[truncated]' : stripped
}

// POST /api/contact — Store a contact form submission
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, subject, message } = body

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: name, email, message' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    if (message.length < 10) {
      return NextResponse.json(
        { error: 'Message must be at least 10 characters' },
        { status: 400 }
      )
    }

    // SEC-07: sanitize all user-supplied fields before storing in the audit log
    const sanitizedName = sanitizeForLog(name, 200)
    const sanitizedEmail = sanitizeForLog(email, 200)
    const sanitizedSubject = sanitizeForLog(subject || '(no subject)', 500)
    const sanitizedMessage = sanitizeForLog(message, 5000)

    // Store as an audit log entry (in production, this would also send an email via Resend)
    await db.auditLog.create({
      data: {
        action: 'contact.form_submitted',
        targetType: 'contact',
        targetId: sanitizedEmail,
        metadata: JSON.stringify({
          name: sanitizedName,
          email: sanitizedEmail,
          subject: sanitizedSubject,
          message: sanitizedMessage,
          submittedAt: new Date().toISOString(),
          ip: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        }),
      },
    })

    // In production, also send an email notification here:
    // await resend.emails.send({
    //   from: 'noreply@reviewreply.com',
    //   to: 'support@reviewreply.com',
    //   subject: `New contact form: ${subject || '(no subject)'}`,
    //   text: `From: ${name} <${email}>\n\n${message}`,
    // })

    return NextResponse.json({
      success: true,
      message: 'Message received. We will respond within 24 hours.',
      ticketId: `CT-${Date.now().toString(36).toUpperCase()}`,
    })
  } catch (error) {
    console.error('Contact form error:', error)
    return NextResponse.json(
      { error: 'Failed to submit message' },
      { status: 500 }
    )
  }
}
