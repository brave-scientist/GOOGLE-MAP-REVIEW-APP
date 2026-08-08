// src/lib/admin-auth.ts — Platform admin authorization
//
// SEC-02: Every route under /api/admin/* MUST call requireAdmin() and use
// the returned user. Any authenticated user can call these routes otherwise.
//
// FAIL-CLOSED BEHAVIOR (critical):
//   If the ADMIN_EMAILS environment variable is unset OR empty, this helper
//   denies EVERYONE — including the demo owner@bamboogarden.com account.
//   This is intentional: in production, an unset ADMIN_EMAILS must NOT
//   silently fall back to a hardcoded email (that email is documented in
//   the demo login, so it would be a guessable admin backdoor).
//
//   To grant admin access, set ADMIN_EMAILS in your environment:
//     ADMIN_EMAILS="alice@yourco.com,bob@yourco.com"
//   Comma-separated, whitespace-trimmed, case-insensitive.

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, SessionUser } from '@/lib/auth'

export interface AdminCheckResult {
  ok: true
  user: SessionUser
}

/**
 * Returns { ok: true, user } if the requester is a configured platform admin.
 * Returns a 401/403 NextResponse otherwise.
 *
 * Failure modes (all fail closed):
 *   - No session                     → 401 (must be authenticated first)
 *   - ADMIN_EMAILS unset/empty       → 403 ADMINS_NOT_CONFIGURED (denies everyone)
 *   - User email not in allowlist    → 403 Admin access required
 */
export async function requireAdmin(
  request: NextRequest,
): Promise<AdminCheckResult | NextResponse> {
  const user = await getCurrentUser(request)
  if (!user) {
    return NextResponse.json(
      { error: 'Admin access required', code: 'UNAUTHORIZED' },
      { status: 401 },
    )
  }

  const adminEmailsEnv = process.env.ADMIN_EMAILS

  // FAIL CLOSED: unset or empty ADMIN_EMAILS means zero admin access.
  // Do NOT fall back to any hardcoded default email.
  if (!adminEmailsEnv || adminEmailsEnv.trim() === '') {
    return NextResponse.json(
      {
        error:
          'Admin access required — ADMIN_EMAILS environment variable is not configured. ' +
          'Set ADMIN_EMAILS to a comma-separated list of admin email addresses.',
        code: 'ADMINS_NOT_CONFIGURED',
      },
      { status: 403 },
    )
  }

  const adminEmails = adminEmailsEnv
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)

  if (adminEmails.length === 0) {
    // Edge case: ADMIN_EMAILS=",,,," — treat as unset
    return NextResponse.json(
      {
        error:
          'Admin access required — ADMIN_EMAILS is set but contains no valid email addresses.',
        code: 'ADMINS_NOT_CONFIGURED',
      },
      { status: 403 },
    )
  }

  if (!adminEmails.includes(user.email.toLowerCase())) {
    return NextResponse.json(
      { error: 'Admin access required', code: 'NOT_ADMIN' },
      { status: 403 },
    )
  }

  return { ok: true, user }
}
