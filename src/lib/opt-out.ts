// lib/opt-out.ts — Opt-out management for SMS and email
import { db } from '@/lib/db'

export async function isOptedOut(contact: string): Promise<boolean> {
  const normalized = normalizeContact(contact)
  const optOut = await db.optOut.findUnique({
    where: { contact: normalized },
  }).catch(() => null)
  return !!optOut
}

export async function optOutContact(contact: string, reason: string): Promise<void> {
  const normalized = normalizeContact(contact)
  await db.optOut.upsert({
    where: { contact: normalized },
    create: { contact: normalized, reason },
    update: { reason }, // Already opted out, update reason
  }).catch(() => {})
}

export async function optInContact(contact: string): Promise<void> {
  const normalized = normalizeContact(contact)
  await db.optOut.delete({
    where: { contact: normalized },
  }).catch(() => {})
}

export async function filterOptedOut(contacts: Array<{ name: string; contact: string }>): Promise<{
  sendable: Array<{ name: string; contact: string }>
  optedOut: number
}> {
  const sendable: Array<{ name: string; contact: string }> = []
  let optedOut = 0

  for (const c of contacts) {
    const isOut = await isOptedOut(c.contact)
    if (isOut) {
      optedOut++
    } else {
      sendable.push(c)
    }
  }

  return { sendable, optedOut }
}

function normalizeContact(contact: string): string {
  let normalized = contact.trim().toLowerCase()
  // Normalize phone numbers: remove all non-digits, ensure +1 prefix
  if (/^[\d\s\+\-\(\)]+$/.test(normalized) && !normalized.includes('@')) {
    const digits = normalized.replace(/[^0-9]/g, '')
    if (digits.length === 10) {
      normalized = `+1${digits}`
    } else if (digits.length === 11 && digits.startsWith('1')) {
      normalized = `+${digits}`
    } else {
      normalized = `+${digits}`
    }
  }
  return normalized
}
