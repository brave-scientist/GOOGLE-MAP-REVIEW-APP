import { NextRequest, NextResponse } from 'next/server'
import { clearSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true, redirectTo: '/' })
  clearSession(response)
  return response
}
