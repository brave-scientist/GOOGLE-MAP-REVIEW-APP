// sentry.client.config.ts — Sentry initialization for client-side
// Requires env var: SENTRY_DSN (or NEXT_PUBLIC_SENTRY_DSN)
// If SENTRY_DSN is not set, Sentry is a no-op (no errors thrown)

import * as Sentry from '@sentry/nextjs'

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.1, // 10% of transactions traced (keep within free tier)
    environment: process.env.NODE_ENV,
    denyUrls: [
      'localhost',
      '127.0.0.1',
    ],
  })
}
