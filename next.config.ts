import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  //output: "standalone",
  // Hide the X-Powered-By header
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // SEC-09: Strip console.log/info/debug from production builds.
  // KEEPS console.error and console.warn — those are legitimate error-reporting
  // channels that Sentry captures and that are essential for production debugging.
  // Only strips the dev-only console.log/info/debug calls (48 total: 46 error,
  // 1 log, 1 warn — only the 1 log gets stripped; warn is kept).
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },
  async redirects() {
    return [
      {
        source: '/settings/team',
        destination: '/settings',
        permanent: false,
      },
    ];
  },
  // Security headers applied to all responses
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          // HSTS — only in production (would break dev server on http)
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }]
            : []),
          // Content-Security-Policy — allows self, Google Fonts, GTM/GA, and inline styles/scripts
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: https: blob: https://www.googletagmanager.com https://www.google-analytics.com",
              "connect-src 'self' https://oauth2.googleapis.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.sentry.io",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry config — only active when SENTRY_DSN env var is set
  silent: true, // Suppresses Sentry build logs when no DSN
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Only upload source maps in production
  sourcemaps: { disable: process.env.NODE_ENV !== 'production' },
  // Automatically instrument Next.js routes
  automaticRouterInstrumentation: true,
});
