// lib/redirect-allowlist.ts — Open-redirect prevention
//
// SEC-10: The /login?redirect= parameter (and any future redirect params)
// must be validated against an allowlist to prevent open-redirect attacks.
// Without this, an attacker could craft a link like:
//   https://yourapp.com/login?redirect=https://evil.com
// and a user who logs in via that link would be redirected to evil.com
// after authentication — a classic phishing vector.
//
// Allowed redirect targets:
//   - Must start with a single forward slash ("/")
//   - Must NOT start with "//" (protocol-relative URL — browsers treat
//     "//evil.com" as "https://evil.com")
//   - Must NOT start with "/\" (backslash variant — some browsers normalize)
//   - Must NOT contain a scheme prefix like "http:", "https:", "javascript:",
//     "data:", "vbscript:", "file:" (case-insensitive)
//   - Must be a relative path, not an absolute URL

const BLOCKED_SCHEMES = /^(https?|ftp|javascript|data|vbscript|file|blob|about|ws|wss):/i

/**
 * Returns a safe redirect path. If the input is suspicious (absolute URL,
 * protocol-relative, or has a scheme prefix), returns the fallback instead.
 *
 * @param input The requested redirect target (e.g. from ?redirect= query param)
 * @param fallback The default path to use if input is invalid (default: '/dashboard')
 * @returns A path that is safe to pass to router.push() or res.redirect()
 */
export function safeRedirectPath(input: string | null | undefined, fallback = '/dashboard'): string {
  if (!input || typeof input !== 'string') {
    return fallback
  }

  // Trim whitespace — leading spaces could be used to bypass some checks
  const trimmed = input.trim()

  // Must be non-empty
  if (!trimmed) {
    return fallback
  }

  // Must start with a single forward slash (relative path)
  if (!trimmed.startsWith('/')) {
    return fallback
  }

  // Reject protocol-relative URLs ("//evil.com" → "https://evil.com")
  if (trimmed.startsWith('//')) {
    return fallback
  }

  // Reject backslash variants ("/\evil.com" — some browsers normalize to "//")
  if (trimmed.startsWith('/\\')) {
    return fallback
  }

  // Reject anything that looks like a scheme prefix anywhere in the first
  // few chars (catches "javascript:", "https:", etc. even after a leading /)
  // Check the first 20 chars — schemes are always at the start
  if (BLOCKED_SCHEMES.test(trimmed.slice(1))) {
    return fallback
  }

  // Reject if the path contains a newline or control character (could be
  // used to smuggle headers in some server contexts)
  if (/[\r\n\t\x00-\x1f]/.test(trimmed)) {
    return fallback
  }

  return trimmed
}
