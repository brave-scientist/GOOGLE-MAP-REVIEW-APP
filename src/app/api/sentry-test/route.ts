import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const error = new Error('Sentry production connection test - REMOVE ME')
  const eventId = Sentry.captureException(error)
  const flushed = await Sentry.flush(3000)

  const client = Sentry.getClient()
  const dsn = client ? client.getDsn() : null

  return NextResponse.json({
    status: 'triggered',
    eventId,
    flushed,
    sentryInitialized: !!client,
    hasDsn: !!dsn,
    projectId: dsn?.projectId || null,
    environment: client?.getOptions()?.environment || null,
  })
}
