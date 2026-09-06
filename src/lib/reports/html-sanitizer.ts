/**
 * src/lib/reports/html-sanitizer.ts
 *
 * Robust, fail-safe HTML escaping for email and report templates.
 * Prevents XSS, markup injection, and template breakage from untrusted user/reviewer inputs.
 */

const HTML_ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#96;',
}

/**
 * Escapes characters with special meaning in HTML contexts.
 * Handles null, undefined, and non-string types safely.
 */
export function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return ''
  const str = String(input)
  return str.replace(/[&<>"'`\/]/g, (match) => HTML_ENTITY_MAP[match] || match)
}

/**
 * Truncates text to a maximum length safely, then HTML-escapes it.
 */
export function escapeAndTruncate(input: unknown, maxLength: number): string {
  if (input === null || input === undefined) return ''
  const str = String(input).trim()
  if (str.length === 0) return ''
  const truncated = str.length > maxLength ? str.slice(0, maxLength) + '…' : str
  return escapeHtml(truncated)
}
