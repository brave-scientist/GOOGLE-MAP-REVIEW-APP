import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

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

    // Store as an audit log entry (in production, this would also send an email via Resend)
    await db.auditLog.create({
      data: {
        action: 'contact.form_submitted',
        targetType: 'contact',
        targetId: email,
        metadata: JSON.stringify({
          name,
          email,
          subject: subject || '(no subject)',
          message,
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
