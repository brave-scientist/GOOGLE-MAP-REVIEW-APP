import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Role } from '@prisma/client'
import { SignJWT, jwtVerify } from 'jose'

const SESSION_COOKIE = 'rr_session'
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

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
}

// Create a signed JWT session token
async function encodeSession(user: SessionUser): Promise<string> {
  return await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + SESSION_TTL) / 1000))
    .setSubject(user.id)
    .sign(secret)
}

// Verify and decode a JWT session token
async function decodeSession(token: string): Promise<SessionUser | null> {
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
    }
  } catch {
    return null
  }
}

export async function createSession(response: NextResponse, user: SessionUser) {
  const token = await encodeSession(user)
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

export async function getSessionFromRequest(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  return await decodeSession(token)
}

export async function getCurrentUser(request: NextRequest): Promise<SessionUser | null> {
  const session = await getSessionFromRequest(request)
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
