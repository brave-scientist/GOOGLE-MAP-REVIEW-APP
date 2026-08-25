import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { rateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limit'

// Routes that DON'T require authentication
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/invite/accept',
  '/privacy',
  '/terms',
  '/about',
  '/blog',
  '/help',
  '/contact',
  '/status',
  '/changelog',
  '/refund',
]

// API routes that DON'T require session authentication
// Note: Webhooks (Stripe, Twilio) validate cryptographic signatures.
// Cron endpoints independently enforce Bearer CRON_SECRET auth.
const PUBLIC_API_ROUTES = [
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/logout',
  '/api/auth/otp',
  '/api/auth/google',
  '/api/auth/me',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/team/invite/verify',
  '/api/team/invite/accept',
  '/api/contact',
  '/api/unsubscribe',
  '/api/webhooks/twilio',
  '/api/webhooks/stripe',
  '/api/cron/downgrade-trials',
  '/api/cron/reports',
  '/api/health',          // Public — for UptimeRobot / load balancer health checks
  '/api/review-us',       // Public — Review Us page fetches links by slug
]

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true
  if (pathname.startsWith('/blog/')) return true
  if (pathname.startsWith('/help/')) return true
  if (pathname.startsWith('/r/')) return true
  if (pathname.startsWith('/review-us/')) return true  // public Review Us page
  if (pathname.startsWith('/unsubscribe')) return true
  if (pathname === '/widget.js') return true
  if (pathname.startsWith('/google') && pathname.endsWith('.html')) return true
  if (pathname.startsWith('/_next')) return true
  if (pathname.startsWith('/favicon')) return true
  return false
}

function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'))
}

// Rate limit configuration per route pattern
function getRateLimitConfig(pathname: string): { limit: number; windowMs: number; identifier: string } | null {
  const ip = getClientIP({ headers: new Headers() } as any) // placeholder, real IP from request

  if (pathname === '/api/auth/login') {
    return { ...RATE_LIMITS.login, identifier: `login:${ip}` }
  }
  if (pathname === '/api/auth/signup') {
    return { ...RATE_LIMITS.signup, identifier: `signup:${ip}` }
  }
  if (pathname === '/api/contact') {
    return { ...RATE_LIMITS.contact, identifier: `contact:${ip}` }
  }
  if (pathname.startsWith('/r/')) {
    return { ...RATE_LIMITS.reviewRequest, identifier: `r:${ip}` }
  }
  if (pathname === '/widget.js') {
    return { ...RATE_LIMITS.widget, identifier: `widget:${ip}` }
  }
  return null
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const ip = getClientIP(request)

  // Rate limit public endpoints
  const rateLimitConfig = getRateLimitConfigWithIP(pathname, ip)
  if (rateLimitConfig) {
    const result = await rateLimit(rateLimitConfig.identifier, rateLimitConfig.limit, rateLimitConfig.windowMs)
    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000)
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Too many requests. Please wait a few minutes before trying again, or use Email OTP / Password Reset.', code: 'RATE_LIMITED', retryAfter },
          { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        )
      }
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      })
    }
  }

  // Allow public pages
  if (isPublicRoute(pathname)) {
    return NextResponse.next()
  }

  // For API routes, check auth
  if (pathname.startsWith('/api/')) {
    if (isPublicApiRoute(pathname)) {
      return NextResponse.next()
    }
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }
    return NextResponse.next()
  }

  // For app routes (not public), check session
  const session = await getSessionFromRequest(request)
  if (!session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

function getRateLimitConfigWithIP(pathname: string, ip: string): { limit: number; windowMs: number; identifier: string } | null {
  if (pathname === '/api/auth/login') {
    return { ...RATE_LIMITS.login, identifier: `login:${ip}` }
  }
  if (pathname === '/api/auth/signup') {
    return { ...RATE_LIMITS.signup, identifier: `signup:${ip}` }
  }
  if (pathname === '/api/contact') {
    return { ...RATE_LIMITS.contact, identifier: `contact:${ip}` }
  }
  if (pathname.startsWith('/r/')) {
    return { ...RATE_LIMITS.reviewRequest, identifier: `r:${ip}` }
  }
  if (pathname === '/widget.js') {
    return { ...RATE_LIMITS.widget, identifier: `widget:${ip}` }
  }
  return null
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.svg|robots.txt|sitemap.xml|google[a-z0-9]+\\.html).*)',
  ],
}
