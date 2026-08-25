import { NextRequest, NextResponse } from 'next/server'
import { SignJWT, jwtVerify } from 'jose'

import type { Role } from '@prisma/client'

export const SESSION_COOKIE = 'rr_session'
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

// Get secret key — in production this MUST be set via env var
const SECRET_KEY = process.env.SESSION_SECRET || 'reviewreply-dev-secret-change-in-production-min-32-chars'
const secret = new TextEncoder().encode(SECRET_KEY)

export interface SessionUser {
  id: string
  email: string
  name: string | null
  role: Role
  orgId: string | null
  orgName: string | null
  orgPlan: string | null
  sessionVersion?: number
}

// Create a signed JWT session token
export async function encodeSession(user: SessionUser): Promise<string> {
  return await new SignJWT({ ...user, sessionVersion: user.sessionVersion ?? 1 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + SESSION_TTL) / 1000))
    .setSubject(user.id)
    .sign(secret)
}

// Verify and decode a JWT session token
export async function decodeSession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string | null,
      role: payload.role as Role,
      orgId: payload.orgId as string | null,
      orgName: payload.orgName as string | null,
      orgPlan: payload.orgPlan as string | null,
      sessionVersion: (payload.sessionVersion as number) ?? 1,
    }
  } catch {
    return null
  }
}

function shouldUseSecureCookie(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_APP_URL?.startsWith('https') === true
}

export async function createSession(response: NextResponse, user: SessionUser) {
  const token = await encodeSession(user)
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    maxAge: SESSION_TTL / 1000,
    path: '/',
  })
}

export function destroySession(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}

export async function getSessionFromRequest(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  return await decodeSession(token)
}
