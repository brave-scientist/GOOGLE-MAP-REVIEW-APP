import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Role } from '@prisma/client'

// Simple session management using HTTP-only cookies
// In production, this would use Supabase Auth or NextAuth.js

const SESSION_COOKIE = 'rr_session'
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

export interface SessionUser {
  id: string
  email: string
  name: string | null
  role: Role
  orgId: string | null
  orgName: string | null
  orgPlan: string | null
}

// Simple base64 encoding for session (NOT secure for production — use proper JWT signing)
function encodeSession(user: SessionUser): string {
  const payload = { ...user, exp: Date.now() + SESSION_TTL }
  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

function decodeSession(token: string): SessionUser | null {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString())
    if (payload.exp && Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

export async function createSession(response: NextResponse, user: SessionUser) {
  const token = encodeSession(user)
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL / 1000,
    path: '/',
  })
}

export function clearSession(response: NextResponse) {
  response.cookies.delete(SESSION_COOKIE)
}

export function getSessionFromRequest(request: NextRequest): SessionUser | null {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  return decodeSession(token)
}

export async function getCurrentUser(request: NextRequest): Promise<SessionUser | null> {
  const session = getSessionFromRequest(request)
  if (!session) return null

  // Verify user still exists in DB
  const user = await db.user.findUnique({
    where: { id: session.id },
    include: {
      memberships: {
        include: {
          org: { select: { id: true, name: true, plan: true } },
        },
      },
    },
  })

  if (!user) return null

  const membership = user.memberships[0]
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: membership?.role || Role.VIEWER,
    orgId: membership?.org.id || null,
    orgName: membership?.org.name || null,
    orgPlan: membership?.org.plan || null,
  }
}

export { SESSION_COOKIE }
