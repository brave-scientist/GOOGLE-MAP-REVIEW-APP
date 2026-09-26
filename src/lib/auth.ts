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

/**
 * Returns the authenticated SessionUser from the request cookie, or null.
 *
 * Performance design: session JWTs already contain the full SessionUser payload
 * (id, email, name, role, orgId, orgName, orgPlan, sessionVersion). We avoid a
 * DB round-trip on every request unless session-version validation requires it.
 *
 * Security: sessionVersion is validated against the DB to detect revoked sessions
 * (password reset, logout-all). The check uses a minimal select to avoid the
 * expensive memberships + org join that was previously done unconditionally.
 */
export async function getCurrentUser(request: NextRequest): Promise<SessionUser | null> {
  const session = await getSessionFromRequest(request)
  if (!session) return null

  // Validate sessionVersion with a minimal single-field DB lookup.
  // This is the only DB query needed — the full user profile is carried in the JWT.
  const user = await db.user.findUnique({
    where: { id: session.id },
    select: {
      sessionVersion: true,
      // Re-fetch email as authoritative source (in case it changed)
      email: true,
      name: true,
    },
  })

  if (!user) return null

  // Session invalidation check
  const userSessionVersion = user.sessionVersion ?? 1
  const tokenSessionVersion = session.sessionVersion ?? 1
  if (userSessionVersion !== tokenSessionVersion) {
    return null // Session was revoked / password reset
  }

  // Return session data from JWT, using DB for authoritative email/name
  return {
    ...session,
    email: user.email,
    name: user.name,
    sessionVersion: user.sessionVersion ?? 1,
  }
}
