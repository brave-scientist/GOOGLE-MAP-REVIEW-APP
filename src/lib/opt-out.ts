// lib/opt-out.ts — Opt-out management for SMS and email
import { db } from '@/lib/db'

export function normalizeContact(contact: unknown): string {
  if (contact === null || contact === undefined) {
    return ''
  }

  // Convert numbers or primitive types to string
  let str = ''
  if (typeof contact === 'string') {
    str = contact
  } else if (typeof contact === 'number' || typeof contact === 'boolean') {
    str = String(contact)
  } else {
    // If an object or unexpected type is passed, treat as empty rather than crashing
    return ''
  }

  let normalized = str.trim().toLowerCase()
  if (!normalized) return ''

  // Normalize phone numbers: remove all non-digits, ensure E.164-style standard format
  if (/^[\d\s\+\-\(\)]+$/.test(normalized) && !normalized.includes('@')) {
    const digits = normalized.replace(/[^0-9]/g, '')
    if (digits.length === 10) {
      normalized = `+1${digits}`
    } else if (digits.length === 11 && digits.startsWith('1')) {
      normalized = `+${digits}`
    } else if (digits.length > 0) {
      normalized = `+${digits}`
    }
  }

  return normalized
}

export async function isOptedOut(contact: unknown): Promise<boolean> {
  const normalized = normalizeContact(contact)
  if (!normalized) return false

  const optOut = await db.optOut.findUnique({
    where: { contact: normalized },
  }).catch(() => null)
  return !!optOut
}

export async function optOutContact(contact: unknown, reason: string): Promise<void> {
  const normalized = normalizeContact(contact)
  if (!normalized) return

  await db.optOut.upsert({
    where: { contact: normalized },
    create: { contact: normalized, reason },
    update: { reason }, // Already opted out, update reason
  }).catch(() => {})
}

export async function optInContact(contact: unknown): Promise<void> {
  const normalized = normalizeContact(contact)
  if (!normalized) return

  await db.optOut.delete({
    where: { contact: normalized },
  }).catch(() => {})
}

export async function filterOptedOut(contacts: Array<{ name?: string; contact?: string | number }>): Promise<{
  sendable: Array<{ name: string; contact: string }>
  optedOut: number
}> {
  const sendable: Array<{ name: string; contact: string }> = []
  let optedOut = 0

  if (!Array.isArray(contacts)) {
    return { sendable, optedOut }
  }

  for (const c of contacts) {
    if (!c || typeof c !== 'object') continue
    const rawContact = c.contact
    const normalized = normalizeContact(rawContact)
    if (!normalized) continue

    const isOut = await isOptedOut(normalized)
    if (isOut) {
      optedOut++
    } else {
      sendable.push({
        name: typeof c.name === 'string' ? c.name : 'Customer',
        contact: normalized,
      })
    }
  }

  return { sendable, optedOut }
}
