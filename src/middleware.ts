import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'

// Routes that DON'T require authentication
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/privacy',
  '/terms',
  '/about',
  '/blog',
  '/help',
  '/contact',
  '/status',
  '/changelog',
]

// API routes that DON'T require authentication
const PUBLIC_API_ROUTES = [
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/logout',
  '/api/auth/otp',
  '/api/auth/google',
  '/api/auth/me',
  '/api/contact',
  '/api/unsubscribe',
  '/api/webhooks/twilio',
]

function isPublicRoute(pathname: string): boolean {
  // Check exact match for public pages
  if (PUBLIC_ROUTES.includes(pathname)) return true
  // Blog post dynamic routes are public
  if (pathname.startsWith('/blog/')) return true
  // Help article dynamic routes are public
  if (pathname.startsWith('/help/')) return true
  // Review request landing page (QR code / SMS link target)
  if (pathname.startsWith('/r/')) return true
  // Unsubscribe page (email link target)
  if (pathname.startsWith('/unsubscribe')) return true
  // Widget.js embeddable script (must be public for external sites)
  if (pathname === '/widget.js') return true
  // Next.js internal routes
  if (pathname.startsWith('/_next')) return true
  if (pathname.startsWith('/favicon')) return true
  return false
}

function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public pages
  if (isPublicRoute(pathname)) {
    return NextResponse.next()
  }

  // For API routes, check auth
  if (pathname.startsWith('/api/')) {
    if (isPublicApiRoute(pathname)) {
      return NextResponse.next()
    }
    // Protected API route — check session
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
    // Redirect to login with return URL
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Match all routes except static assets
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.svg|robots.txt|sitemap.xml).*)',
  ],
}
