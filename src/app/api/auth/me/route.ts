import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Compute platform-admin status server-side.
// Only returns a boolean — never exposes ADMIN_EMAILS list.
function computeIsAdmin(email: string): boolean {
  const adminEmailsEnv = process.env.ADMIN_EMAILS
  if (!adminEmailsEnv || adminEmailsEnv.trim() === '') return false
  const adminEmails = adminEmailsEnv
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
  return adminEmails.includes(email.toLowerCase())
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) {
    return NextResponse.json({ user: null, isAdmin: false }, { status: 200 })
  }
  return NextResponse.json({ user, isAdmin: computeIsAdmin(user.email) })
}
