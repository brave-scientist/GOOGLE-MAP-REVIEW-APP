import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const error = new Error('Sentry production connection test - REMOVE ME')
    const eventId = Sentry.captureException(error)
    await Sentry.flush(2000)

    return NextResponse.json({
      success: true,
      eventId,
      sentryDsnConfigured: !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
    })
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err?.message || String(err),
    }, { status: 500 })
  }
}
