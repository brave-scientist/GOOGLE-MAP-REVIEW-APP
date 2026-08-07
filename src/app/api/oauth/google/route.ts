import { NextRequest, NextResponse } from 'next/server'
import { getGoogleAuthUrl, isGoogleConfigured } from '@/lib/integrations/google-business-profile'

export const dynamic = 'force-dynamic'

// GET /api/oauth/google — Redirect to Google OAuth consent screen
export async function GET(request: NextRequest) {
  if (!isGoogleConfigured()) {
    return NextResponse.json({
      error: 'Google OAuth not configured',
      message: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env to enable Google Business Profile integration.',
      setupInstructions: {
        step1: 'Go to https://console.cloud.google.com → Create project',
        step2: 'Enable "Google Business Profile API" in APIs & Services → Library',
        step3: 'Create OAuth 2.0 credentials (Web application) in APIs & Services → Credentials',
        step4: 'Add this URL to Authorized redirect URIs: ' + new URL('/api/oauth/google/callback', request.url).origin + '/api/oauth/google/callback',
        step5: 'Submit API access request at https://developers.google.com/my-business/content/prereq-faq (takes 4-6 weeks)',
        step6: 'Copy Client ID and Client Secret to .env as GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
      },
    }, { status: 503 })
  }

  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('businessId') || ''
  const redirectUri = `${new URL('/api/oauth/google/callback', request.url).origin}/api/oauth/google/callback`

  const authUrl = getGoogleAuthUrl(redirectUri, businessId)
  return NextResponse.redirect(authUrl)
}
