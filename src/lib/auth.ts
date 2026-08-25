import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { Role } from '@prisma/client'
import {
  SESSION_COOKIE,
  SESSION_TTL,
  SessionUser,
  encodeSession,
  decodeSession,
  createSession,
  destroySession,
  getSessionFromRequest,
} from '@/lib/session'

export {
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionUser,
  encodeSession,
  decodeSession,
  createSession,
  destroySession,
  getSessionFromRequest,
}

// Alias for clearSession
export const clearSession = destroySession

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

  // Session invalidation check: compare sessionVersion in token with DB
  const userSessionVersion = user.sessionVersion ?? 1
  const tokenSessionVersion = session.sessionVersion ?? 1
  if (userSessionVersion !== tokenSessionVersion) {
    return null // Session was revoked / password reset
  }

  const membership = user.memberships[0]
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: membership?.role || Role.VIEWER,
    orgId: membership?.org.id || null,
    orgName: membership?.org.name || null,
    orgPlan: membership?.org.plan || null,
    sessionVersion: user.sessionVersion,
  }
}
