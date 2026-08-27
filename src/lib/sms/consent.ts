// src/lib/sms/consent.ts — Affirmative SMS Consent Ledger & Verification
// SMS-002.1: Customer-originated, cryptographically verifiable, immutable SMS consent architecture
import crypto from 'crypto'
import { db } from '@/lib/db'
import { validateAndNormalizePhone } from './phone'

export enum ConsentStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
  UNVERIFIED_LEGACY = 'UNVERIFIED_LEGACY',
}

export enum SmsConsentType {
  EXPRESS_WRITTEN = 'EXPRESS_WRITTEN',
  TRANSACTIONAL = 'TRANSACTIONAL',
  IMPLIED = 'IMPLIED',
}

export enum SmsConsentSource {
  CUSTOMER_WEB_FORM = 'CUSTOMER_WEB_FORM',
  API_IMPORT = 'API_IMPORT',
  VERIFIED_API_IMPORT = 'VERIFIED_API_IMPORT',
  IN_PERSON_KIOSK = 'IN_PERSON_KIOSK',
  CHECKOUT_FORM = 'CHECKOUT_FORM',
  WEBSITE_FORM = 'WEBSITE_FORM',
  LEGACY_IMPORT = 'LEGACY_IMPORT',
  MANUAL_ENTRY = 'MANUAL_ENTRY',
  STAFF_RECORDED = 'STAFF_RECORDED',
}

export enum ConsentEventType {
  GRANTED = 'GRANTED',
  REVOKED = 'REVOKED',
  REGRANTED = 'REGRANTED',
  IMPORTED = 'IMPORTED',
  MIGRATED_LEGACY = 'MIGRATED_LEGACY',
}

export enum ConsentInviteStatus {
  PENDING = 'PENDING',
  CONSUMED = 'CONSUMED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

/**
 * Controlled list of consent types permitted for commercial review-request SMS dispatches.
 * Under TCPA/CTIA regulations, commercial review requests strictly require EXPRESS_WRITTEN consent.
 */
export const ALLOWED_COMMERCIAL_CONSENT_TYPES: readonly SmsConsentType[] = [
  SmsConsentType.EXPRESS_WRITTEN,
]

/**
 * Valid sources that represent authoritative customer affirmative consent.
 * Excludes STAFF_RECORDED, MANUAL_ENTRY, and LEGACY_IMPORT.
 */
export const AUTHORIZED_CONSENT_SOURCES: readonly SmsConsentSource[] = [
  SmsConsentSource.CUSTOMER_WEB_FORM,
  SmsConsentSource.VERIFIED_API_IMPORT,
  SmsConsentSource.IN_PERSON_KIOSK,
  SmsConsentSource.CHECKOUT_FORM,
  SmsConsentSource.WEBSITE_FORM,
]

export const DEFAULT_DISCLOSURE_VERSION = 'v1'
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// ── Controlled Approved Disclosure Templates ────────────────────
export interface DisclosureTemplateInfo {
  version: string
  title: string
  purpose: string
  bodyTemplate: string
  compiledText: string
}

export const APPROVED_DISCLOSURE_TEMPLATES: Record<string, { title: string; purpose: string; bodyTemplate: string }> = {
  v1: {
    title: 'Customer Review & Feedback SMS Consent',
    purpose: 'REVIEW_REQUEST',
    bodyTemplate: 'By checking this box, you agree to receive customer feedback and review request text messages from {businessName}. Message and data rates may apply. Message frequency varies. Reply STOP to opt out, HELP for help.',
  },
}

/**
 * Resolves the approved disclosure text and metadata for a given business and version.
 * Server controls the exact text — client cannot inject arbitrary legal text.
 */
export function getApprovedDisclosure(businessName: string, version: string = DEFAULT_DISCLOSURE_VERSION): DisclosureTemplateInfo {
  const name = businessName?.trim() || 'ReviewReply'
  const template = APPROVED_DISCLOSURE_TEMPLATES[version] || APPROVED_DISCLOSURE_TEMPLATES[DEFAULT_DISCLOSURE_VERSION]
  const compiledText = template.bodyTemplate.replace(/\{businessName\}/g, name)

  return {
    version: version in APPROVED_DISCLOSURE_TEMPLATES ? version : DEFAULT_DISCLOSURE_VERSION,
    title: template.title,
    purpose: template.purpose,
    bodyTemplate: template.bodyTemplate,
    compiledText,
  }
}

/**
 * Generates the standardized, compliant disclosure text for a business.
 */
export function getDefaultSmsDisclosureText(businessName: string, version: string = DEFAULT_DISCLOSURE_VERSION): string {
  return getApprovedDisclosure(businessName, version).compiledText
}

// ── Cryptographic Token Helpers ─────────────────────────────────

export interface GeneratedConsentToken {
  rawToken: string
  tokenHash: string
  expiresAt: Date
}

/**
 * Generates a cryptographically secure 32-byte opaque token and its SHA-256 hash.
 */
export function generateConsentToken(ttlMs: number = INVITATION_TTL_MS): GeneratedConsentToken {
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashConsentToken(rawToken)
  const expiresAt = new Date(Date.now() + ttlMs)
  return { rawToken, tokenHash, expiresAt }
}

/**
 * SHA-256 hash helper for consent tokens.
 */
export function hashConsentToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

// ── Customer Consent Invitation Creation ────────────────────────

export interface CreateConsentInvitationInput {
  businessId: string
  contact: string
  recipientName?: string
  actorId?: string | null
  appUrl?: string
  disclosureVersion?: string
}

export interface ConsentInvitationResult {
  success: boolean
  errorCode?: string
  error?: string
  rawToken?: string
  inviteUrl?: string
  expiresAt?: Date
  invitation?: {
    id: string
    businessId: string
    contact: string
    status: string
    expiresAt: Date
  }
}

/**
 * Creates a cryptographically secure, single-use, expiring SMS consent invitation.
 */
export async function createConsentInvitation(input: CreateConsentInvitationInput): Promise<ConsentInvitationResult> {
  const { businessId, contact, recipientName, actorId, appUrl, disclosureVersion = DEFAULT_DISCLOSURE_VERSION } = input

  if (!businessId || typeof businessId !== 'string' || !businessId.trim()) {
    return { success: false, errorCode: 'INVALID_BUSINESS_ID', error: 'Valid businessId is required.' }
  }

  const phoneResult = validateAndNormalizePhone(contact)
  if (!phoneResult.valid || !phoneResult.e164) {
    return {
      success: false,
      errorCode: 'INVALID_PHONE_NUMBER',
      error: phoneResult.error || 'Destination phone number is not valid.',
    }
  }
  const toE164 = phoneResult.e164

  // Verify business exists
  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true },
  })
  if (!business) {
    return { success: false, errorCode: 'BUSINESS_NOT_FOUND', error: 'Associated business entity not found.' }
  }

  const { rawToken, tokenHash, expiresAt } = generateConsentToken()

  try {
    const invitation = await db.customerSmsConsentInvitation.create({
      data: {
        businessId,
        contact: toE164,
        recipientName: recipientName?.trim() || null,
        tokenHash,
        disclosureVersion,
        status: ConsentInviteStatus.PENDING,
        expiresAt,
      },
    })

    const baseUrl = appUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const inviteUrl = `${baseUrl.replace(/\/$/, '')}/consent/${rawToken}`

    // Audit Logging (PII-masked, no raw token!)
    const maskedPhone = toE164.slice(0, 4) + '****' + toE164.slice(-4)
    await db.auditLog.create({
      data: {
        actorId: actorId || null,
        action: 'sms.consent.invitation_created',
        targetType: 'business',
        targetId: businessId,
        metadata: JSON.stringify({
          businessId,
          contact: maskedPhone,
          invitationId: invitation.id,
          expiresAt: expiresAt.toISOString(),
          disclosureVersion,
        }),
      },
    }).catch(() => {})

    return {
      success: true,
      rawToken,
      inviteUrl,
      expiresAt,
      invitation: {
        id: invitation.id,
        businessId: invitation.businessId,
        contact: maskedPhone,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      },
    }
  } catch (err: any) {
    console.error('[SMS-CONSENT] Failed to create consent invitation:', err)
    return {
      success: false,
      errorCode: 'DATABASE_ERROR',
      error: err?.message || 'Failed to create consent invitation.',
    }
  }
}

// ── Verify Consent Invitation (Public Customer View) ────────────

export interface VerifiedInvitationInfo {
  valid: boolean
  errorCode?: string
  error?: string
  invitationId?: string
  businessId?: string
  businessName?: string
  contact?: string
  maskedContact?: string
  disclosureVersion?: string
  disclosureText?: string
  expiresAt?: Date
}

/**
 * Validates a consent token for public presentation to the customer.
 * Never leaks raw secrets, internal database IDs, or unauthorized PII.
 */
export async function verifyConsentInvitation(rawToken: string): Promise<VerifiedInvitationInfo> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length < 16) {
    return { valid: false, errorCode: 'INVALID_TOKEN', error: 'Invalid or missing consent token.' }
  }

  const tokenHash = hashConsentToken(rawToken.trim())

  try {
    const invitation = await db.customerSmsConsentInvitation.findUnique({
      where: { tokenHash },
      include: {
        business: {
          select: { id: true, name: true },
        },
      },
    })

    if (!invitation) {
      return { valid: false, errorCode: 'TOKEN_NOT_FOUND', error: 'Consent link is invalid or does not exist.' }
    }

    if (invitation.consumedAt || invitation.status === ConsentInviteStatus.CONSUMED) {
      return { valid: false, errorCode: 'TOKEN_ALREADY_CONSUMED', error: 'This consent link has already been used.' }
    }

    if (invitation.status === ConsentInviteStatus.REVOKED) {
      return { valid: false, errorCode: 'TOKEN_REVOKED', error: 'This consent invitation has been revoked.' }
    }

    if (invitation.expiresAt < new Date() || invitation.status === ConsentInviteStatus.EXPIRED) {
      if (invitation.status !== ConsentInviteStatus.EXPIRED) {
        await db.customerSmsConsentInvitation.update({
          where: { id: invitation.id },
          data: { status: ConsentInviteStatus.EXPIRED },
        }).catch(() => {})
      }
      return { valid: false, errorCode: 'TOKEN_EXPIRED', error: 'This consent link has expired. Please request a new link.' }
    }

    const businessName = invitation.business?.name || 'ReviewReply'
    const approved = getApprovedDisclosure(businessName, invitation.disclosureVersion)
    const maskedContact = invitation.contact.slice(0, 4) + ' ••• ' + invitation.contact.slice(-4)

    return {
      valid: true,
      invitationId: invitation.id,
      businessId: invitation.businessId,
      businessName,
      contact: invitation.contact,
      maskedContact,
      disclosureVersion: approved.version,
      disclosureText: approved.compiledText,
      expiresAt: invitation.expiresAt,
    }
  } catch (err: any) {
    console.error('[SMS-CONSENT] Error verifying token:', err)
    return { valid: false, errorCode: 'SERVER_ERROR', error: 'Unable to verify consent link at this time.' }
  }
}

// ── Customer Affirmative Consent Granting ───────────────────────

export interface GrantCustomerConsentInput {
  rawToken: string
  confirmed: boolean
  ipAddress?: string | null
  userAgent?: string | null
  sourceUrl?: string | null
}

export interface GrantConsentResult {
  success: boolean
  errorCode?: string
  error?: string
  consentId?: string
  eventId?: string
  businessId?: string
  businessName?: string
  consentedAt?: Date
}

/**
 * Processes affirmative customer-originated SMS consent submission.
 * Server derives business, contact, disclosure text/version from validated token.
 */
export async function grantCustomerConsent(input: GrantCustomerConsentInput): Promise<GrantConsentResult> {
  const { rawToken, confirmed, ipAddress, userAgent, sourceUrl } = input

  if (!confirmed) {
    return {
      success: false,
      errorCode: 'AFFIRMATIVE_ACTION_REQUIRED',
      error: 'You must affirmatively check the consent checkbox to agree.',
    }
  }

  const verification = await verifyConsentInvitation(rawToken)
  if (!verification.valid || !verification.businessId || !verification.contact || !verification.invitationId) {
    return {
      success: false,
      errorCode: verification.errorCode || 'INVALID_TOKEN',
      error: verification.error || 'Invalid or expired consent token.',
    }
  }

  const { businessId, businessName = 'ReviewReply', contact, disclosureVersion = DEFAULT_DISCLOSURE_VERSION, disclosureText = '' } = verification
  const now = new Date()

  try {
    // 1. Atomically consume the invitation token
    const updatedInvite = await db.customerSmsConsentInvitation.updateMany({
      where: {
        id: verification.invitationId,
        status: ConsentInviteStatus.PENDING,
        consumedAt: null,
      },
      data: {
        status: ConsentInviteStatus.CONSUMED,
        consumedAt: now,
      },
    })

    if (updatedInvite.count === 0) {
      return {
        success: false,
        errorCode: 'TOKEN_ALREADY_CONSUMED',
        error: 'This consent token was already consumed in another request.',
      }
    }

    // 2. Determine Event Type (GRANTED vs REGRANTED)
    const existing = await db.customerSmsConsent.findUnique({
      where: {
        businessId_contact: {
          businessId,
          contact,
        },
      },
    })

    const eventType = existing && existing.status === ConsentStatus.REVOKED
      ? ConsentEventType.REGRANTED
      : ConsentEventType.GRANTED

    // 3. Upsert Active State Pointer
    const consentRecord = await db.customerSmsConsent.upsert({
      where: {
        businessId_contact: {
          businessId,
          contact,
        },
      },
      create: {
        businessId,
        contact,
        status: ConsentStatus.ACTIVE,
        consentType: SmsConsentType.EXPRESS_WRITTEN,
        consentSource: SmsConsentSource.CUSTOMER_WEB_FORM,
        currentVersion: disclosureVersion,
        disclosureText,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        consentedAt: now,
        revokedAt: null,
      },
      update: {
        status: ConsentStatus.ACTIVE,
        consentType: SmsConsentType.EXPRESS_WRITTEN,
        consentSource: SmsConsentSource.CUSTOMER_WEB_FORM,
        currentVersion: disclosureVersion,
        disclosureText,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        consentedAt: now,
        revokedAt: null, // Clear revocation
      },
    })

    // 4. Append Immutable Evidence Event
    const event = await db.customerSmsConsentEvent.create({
      data: {
        consentId: consentRecord.id,
        businessId,
        contact,
        eventType,
        consentType: SmsConsentType.EXPRESS_WRITTEN,
        consentSource: SmsConsentSource.CUSTOMER_WEB_FORM,
        disclosureVersion,
        disclosureText,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        sourceUrl: sourceUrl || `/consent/${rawToken.slice(0, 8)}...`,
        evidenceMetadata: JSON.stringify({
          invitationId: verification.invitationId,
          affirmativeCheckboxChecked: true,
          businessName,
        }),
        occurredAt: now,
      },
    })

    // Update lastEventId pointer
    await db.customerSmsConsent.update({
      where: { id: consentRecord.id },
      data: { lastEventId: event.id },
    }).catch(() => {})

    // 5. Audit Logging (PII-masked)
    const maskedPhone = contact.slice(0, 4) + '****' + contact.slice(-4)
    await db.auditLog.create({
      data: {
        action: eventType === ConsentEventType.REGRANTED ? 'sms.consent.regranted' : 'sms.consent.granted',
        targetType: 'business',
        targetId: businessId,
        ip: ipAddress || null,
        metadata: JSON.stringify({
          businessId,
          contact: maskedPhone,
          consentId: consentRecord.id,
          eventId: event.id,
          disclosureVersion,
          eventType,
        }),
      },
    }).catch(() => {})

    return {
      success: true,
      consentId: consentRecord.id,
      eventId: event.id,
      businessId,
      businessName,
      consentedAt: now,
    }
  } catch (err: any) {
    console.error('[SMS-CONSENT] Failed to grant consent:', err)
    return {
      success: false,
      errorCode: 'DATABASE_ERROR',
      error: err?.message || 'Failed to record affirmative consent.',
    }
  }
}

// ── Explicit Revocation ─────────────────────────────────────────

export interface RevokeConsentInput {
  businessId: string
  contact: string
  reason?: string
  actorId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}

export interface RevokeConsentResult {
  success: boolean
  errorCode?: string
  error?: string
  consentId?: string
  eventId?: string
}

/**
 * Explicitly revokes SMS consent for a contact and business.
 * Appends a REVOKED event to the immutable ledger without destroying historical evidence.
 */
export async function revokeConsent(input: RevokeConsentInput): Promise<RevokeConsentResult> {
  const { businessId, contact, reason, actorId, ipAddress, userAgent } = input

  if (!businessId || typeof businessId !== 'string' || !businessId.trim()) {
    return { success: false, errorCode: 'INVALID_BUSINESS_ID', error: 'Valid businessId is required.' }
  }

  const phoneResult = validateAndNormalizePhone(contact)
  if (!phoneResult.valid || !phoneResult.e164) {
    return {
      success: false,
      errorCode: 'INVALID_PHONE_NUMBER',
      error: phoneResult.error || 'Destination phone number is not valid.',
    }
  }
  const toE164 = phoneResult.e164
  const now = new Date()

  try {
    const existing = await db.customerSmsConsent.findUnique({
      where: {
        businessId_contact: {
          businessId,
          contact: toE164,
        },
      },
    })

    if (!existing) {
      return {
        success: false,
        errorCode: 'CONSENT_NOT_FOUND',
        error: 'No consent record found for this business and contact.',
      }
    }

    if (existing.status === ConsentStatus.REVOKED && existing.revokedAt) {
      return {
        success: true,
        consentId: existing.id,
      }
    }

    // 1. Append REVOKED event to immutable ledger
    const event = await db.customerSmsConsentEvent.create({
      data: {
        consentId: existing.id,
        businessId,
        contact: toE164,
        eventType: ConsentEventType.REVOKED,
        consentType: existing.consentType,
        consentSource: existing.consentSource,
        disclosureVersion: existing.currentVersion || DEFAULT_DISCLOSURE_VERSION,
        disclosureText: existing.disclosureText || '',
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        actorId: actorId || null,
        evidenceMetadata: JSON.stringify({
          reason: reason || 'explicit_revocation',
          revokedBy: actorId ? `staff:${actorId}` : 'customer_request',
        }),
        occurredAt: now,
      },
    })

    // 2. Update active status pointer
    await db.customerSmsConsent.update({
      where: { id: existing.id },
      data: {
        status: ConsentStatus.REVOKED,
        revokedAt: now,
        lastEventId: event.id,
      },
    })

    // 3. Audit Logging (PII-masked)
    const maskedPhone = toE164.slice(0, 4) + '****' + toE164.slice(-4)
    await db.auditLog.create({
      data: {
        actorId: actorId || null,
        action: 'sms.consent.revoked',
        targetType: 'business',
        targetId: businessId,
        metadata: JSON.stringify({
          businessId,
          contact: maskedPhone,
          reason: reason || 'explicit_revocation',
          consentId: existing.id,
          eventId: event.id,
        }),
      },
    }).catch(() => {})

    return {
      success: true,
      consentId: existing.id,
      eventId: event.id,
    }
  } catch (err: any) {
    console.error('[SMS-CONSENT] Failed to revoke consent:', err)
    return {
      success: false,
      errorCode: 'DATABASE_ERROR',
      error: err?.message || 'Failed to revoke SMS consent.',
    }
  }
}

// ── Structured API Provenance Import ────────────────────────────

export interface ImportConsentItem {
  contact: string
  externalSystem: string
  externalRecordId?: string
  originalTimestamp: string | Date
  originalDisclosureText: string
  evidenceDescription?: string
}

export interface ImportConsentBatchInput {
  businessId: string
  items: ImportConsentItem[]
  actorId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}

export interface ImportConsentItemResult {
  contact: string
  success: boolean
  eligibleForSms: boolean
  status: ConsentStatus
  errorCode?: string
  error?: string
  consentId?: string
  eventId?: string
}

/**
 * Validates whether imported evidence meets the strict standard for commercial SMS eligibility.
 */
export function validateImportProvenance(item: ImportConsentItem): { valid: boolean; reason?: string } {
  if (!item.externalSystem || typeof item.externalSystem !== 'string' || item.externalSystem.trim().length < 2) {
    return { valid: false, reason: 'externalSystem is required (e.g., "Shopify POS", "Square", "Custom Checkout")' }
  }

  const timestamp = new Date(item.originalTimestamp)
  if (isNaN(timestamp.getTime()) || timestamp.getTime() > Date.now() + 5000) {
    return { valid: false, reason: 'originalTimestamp must be a valid timestamp in the past' }
  }

  if (!item.originalDisclosureText || typeof item.originalDisclosureText !== 'string' || item.originalDisclosureText.trim().length < 15) {
    return { valid: false, reason: 'originalDisclosureText is required and must capture the exact opt-in agreement (min 15 chars)' }
  }

  const text = item.originalDisclosureText.toLowerCase()
  const hasOptInKeyword = text.includes('agree') || text.includes('consent') || text.includes('opt in') || text.includes('receive') || text.includes('text') || text.includes('sms')
  if (!hasOptInKeyword) {
    return { valid: false, reason: 'originalDisclosureText must contain clear affirmative opt-in language' }
  }

  return { valid: true }
}

/**
 * Imports historical consent evidence with structured provenance verification.
 * If provenance is complete, records VERIFIED_API_IMPORT (eligible for SMS).
 * If incomplete, classifies as UNVERIFIED_LEGACY (fails closed, blocked from SMS).
 */
export async function importConsentEvidence(input: ImportConsentBatchInput): Promise<{
  total: number
  verifiedCount: number
  unverifiedCount: number
  results: ImportConsentItemResult[]
}> {
  const { businessId, items, actorId, ipAddress, userAgent } = input
  const results: ImportConsentItemResult[] = []
  let verifiedCount = 0
  let unverifiedCount = 0

  for (const item of items) {
    const phoneResult = validateAndNormalizePhone(item.contact)
    if (!phoneResult.valid || !phoneResult.e164) {
      results.push({
        contact: item.contact,
        success: false,
        eligibleForSms: false,
        status: ConsentStatus.UNVERIFIED_LEGACY,
        errorCode: 'INVALID_PHONE_NUMBER',
        error: phoneResult.error || 'Invalid phone number format.',
      })
      continue
    }
    const toE164 = phoneResult.e164
    const provenanceCheck = validateImportProvenance(item)
    const now = new Date()

    if (provenanceCheck.valid) {
      // Complete Provenance -> VERIFIED_API_IMPORT -> ACTIVE
      try {
        const consentRecord = await db.customerSmsConsent.upsert({
          where: {
            businessId_contact: {
              businessId,
              contact: toE164,
            },
          },
          create: {
            businessId,
            contact: toE164,
            status: ConsentStatus.ACTIVE,
            consentType: SmsConsentType.EXPRESS_WRITTEN,
            consentSource: SmsConsentSource.VERIFIED_API_IMPORT,
            currentVersion: 'imported_custom',
            disclosureText: item.originalDisclosureText.trim(),
            consentedAt: new Date(item.originalTimestamp),
            revokedAt: null,
          },
          update: {
            status: ConsentStatus.ACTIVE,
            consentType: SmsConsentType.EXPRESS_WRITTEN,
            consentSource: SmsConsentSource.VERIFIED_API_IMPORT,
            currentVersion: 'imported_custom',
            disclosureText: item.originalDisclosureText.trim(),
            consentedAt: new Date(item.originalTimestamp),
            revokedAt: null,
          },
        })

        const event = await db.customerSmsConsentEvent.create({
          data: {
            consentId: consentRecord.id,
            businessId,
            contact: toE164,
            eventType: ConsentEventType.IMPORTED,
            consentType: SmsConsentType.EXPRESS_WRITTEN,
            consentSource: SmsConsentSource.VERIFIED_API_IMPORT,
            disclosureVersion: 'imported_custom',
            disclosureText: item.originalDisclosureText.trim(),
            externalSystem: item.externalSystem.trim(),
            externalRecordId: item.externalRecordId?.trim() || null,
            externalTimestamp: new Date(item.originalTimestamp),
            evidenceMetadata: JSON.stringify({
              evidenceDescription: item.evidenceDescription?.trim() || 'Structured API Provenance Import',
              importedBy: actorId || 'api',
            }),
            actorId: actorId || null,
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
            occurredAt: now,
          },
        })

        await db.customerSmsConsent.update({
          where: { id: consentRecord.id },
          data: { lastEventId: event.id },
        }).catch(() => {})

        verifiedCount++
        results.push({
          contact: toE164,
          success: true,
          eligibleForSms: true,
          status: ConsentStatus.ACTIVE,
          consentId: consentRecord.id,
          eventId: event.id,
        })
      } catch (err: any) {
        results.push({
          contact: toE164,
          success: false,
          eligibleForSms: false,
          status: ConsentStatus.UNVERIFIED_LEGACY,
          errorCode: 'DATABASE_ERROR',
          error: err?.message,
        })
      }
    } else {
      // Incomplete Provenance -> UNVERIFIED_LEGACY -> Blocked from sending
      try {
        const consentRecord = await db.customerSmsConsent.upsert({
          where: {
            businessId_contact: {
              businessId,
              contact: toE164,
            },
          },
          create: {
            businessId,
            contact: toE164,
            status: ConsentStatus.UNVERIFIED_LEGACY,
            consentType: SmsConsentType.EXPRESS_WRITTEN,
            consentSource: SmsConsentSource.LEGACY_IMPORT,
            currentVersion: 'unverified_import',
            disclosureText: item.originalDisclosureText || 'Incomplete provenance import',
            consentedAt: now,
            revokedAt: null,
          },
          update: {
            status: ConsentStatus.UNVERIFIED_LEGACY,
            consentSource: SmsConsentSource.LEGACY_IMPORT,
          },
        })

        const event = await db.customerSmsConsentEvent.create({
          data: {
            consentId: consentRecord.id,
            businessId,
            contact: toE164,
            eventType: ConsentEventType.MIGRATED_LEGACY,
            consentType: SmsConsentType.EXPRESS_WRITTEN,
            consentSource: SmsConsentSource.LEGACY_IMPORT,
            disclosureVersion: 'unverified_import',
            disclosureText: item.originalDisclosureText || 'Incomplete provenance import',
            evidenceMetadata: JSON.stringify({
              rejectionReason: provenanceCheck.reason,
              importedBy: actorId || 'api',
            }),
            actorId: actorId || null,
            occurredAt: now,
          },
        })

        unverifiedCount++
        results.push({
          contact: toE164,
          success: false,
          eligibleForSms: false,
          status: ConsentStatus.UNVERIFIED_LEGACY,
          errorCode: 'INSUFFICIENT_PROVENANCE',
          error: `Import recorded as unverified evidence (not authorized for SMS): ${provenanceCheck.reason}`,
          consentId: consentRecord.id,
          eventId: event.id,
        })
      } catch (err: any) {
        results.push({
          contact: toE164,
          success: false,
          eligibleForSms: false,
          status: ConsentStatus.UNVERIFIED_LEGACY,
          errorCode: 'DATABASE_ERROR',
          error: err?.message,
        })
      }
    }
  }

  return {
    total: items.length,
    verifiedCount,
    unverifiedCount,
    results,
  }
}

// ── Authoritative Dispatch Pre-Send Gate ────────────────────────

/**
 * Verifies whether an active, customer-originated or verified provenance affirmative consent record exists.
 *
 * Rules:
 * 1. Requires normalized E.164 phone.
 * 2. Requires `status === 'ACTIVE'`.
 * 3. Requires `revokedAt === null`.
 * 4. Requires `consentType === EXPRESS_WRITTEN` (or in allowedTypes).
 * 5. Requires `consentSource` in AUTHORIZED_CONSENT_SOURCES.
 *    (Fails closed for MANUAL_ENTRY, STAFF_RECORDED, LEGACY_IMPORT, UNVERIFIED_LEGACY).
 */
export async function hasValidConsent(
  businessId: string,
  contact: string,
  allowedTypes: readonly SmsConsentType[] = ALLOWED_COMMERCIAL_CONSENT_TYPES
): Promise<boolean> {
  if (!businessId || !contact) return false

  const phoneResult = validateAndNormalizePhone(contact)
  if (!phoneResult.valid || !phoneResult.e164) return false
  const toE164 = phoneResult.e164

  try {
    const consent = await db.customerSmsConsent.findUnique({
      where: {
        businessId_contact: {
          businessId,
          contact: toE164,
        },
      },
      select: {
        id: true,
        status: true,
        consentType: true,
        consentSource: true,
        revokedAt: true,
        disclosureText: true,
      },
    })

    if (!consent) return false
    if (consent.status !== ConsentStatus.ACTIVE || consent.revokedAt !== null) return false
    if (!allowedTypes.includes(consent.consentType as SmsConsentType)) return false
    if (!AUTHORIZED_CONSENT_SOURCES.includes(consent.consentSource as SmsConsentSource)) return false
    if (!consent.disclosureText || consent.disclosureText.trim().length < 10) return false

    return true
  } catch {
    return false
  }
}

// ── Sanitized Status Helper for UI & API ────────────────────────

export interface ConsentStatusInfo {
  eligible: boolean
  status: ConsentStatus | string
  consentType?: string
  consentSource?: string
  consentGrantedAt?: string | null
  disclosureVersion?: string | null
}

/**
 * Returns safe, sanitized consent status for a recipient.
 * Never exposes raw tokens, full IP address, user-agent, or internal keys.
 */
export async function getConsentStatus(businessId: string, contact: string): Promise<ConsentStatusInfo> {
  const phoneResult = validateAndNormalizePhone(contact)
  if (!phoneResult.valid || !phoneResult.e164) {
    return { eligible: false, status: 'INVALID_CONTACT' }
  }
  const toE164 = phoneResult.e164

  try {
    const consent = await db.customerSmsConsent.findUnique({
      where: {
        businessId_contact: {
          businessId,
          contact: toE164,
        },
      },
      select: {
        status: true,
        consentType: true,
        consentSource: true,
        consentedAt: true,
        currentVersion: true,
        revokedAt: true,
      },
    })

    if (!consent) {
      return { eligible: false, status: 'NO_CONSENT' }
    }

    const isEligible = consent.status === ConsentStatus.ACTIVE &&
      consent.revokedAt === null &&
      ALLOWED_COMMERCIAL_CONSENT_TYPES.includes(consent.consentType as SmsConsentType) &&
      AUTHORIZED_CONSENT_SOURCES.includes(consent.consentSource as SmsConsentSource)

    return {
      eligible: isEligible,
      status: consent.status,
      consentType: consent.consentType,
      consentSource: consent.consentSource,
      consentGrantedAt: consent.consentedAt ? consent.consentedAt.toISOString() : null,
      disclosureVersion: consent.currentVersion,
    }
  } catch {
    return { eligible: false, status: 'ERROR' }
  }
}

/**
 * Retrieves the full consent record for internal diagnostics.
 */
export async function getConsentRecord(businessId: string, contact: string) {
  if (!businessId || !contact) return null

  const phoneResult = validateAndNormalizePhone(contact)
  if (!phoneResult.valid || !phoneResult.e164) return null
  const toE164 = phoneResult.e164

  return db.customerSmsConsent.findUnique({
    where: {
      businessId_contact: {
        businessId,
        contact: toE164,
      },
    },
    include: {
      events: {
        orderBy: { occurredAt: 'desc' },
        take: 10,
      },
    },
  }).catch(() => null)
}

// ── Backwards-Compatible Legacy recordConsent Wrapper ───────────

export interface RecordConsentInput {
  businessId: string
  contact: string
  consentType?: SmsConsentType | string
  consentSource?: SmsConsentSource | string
  disclosureText: string
  ipAddress?: string | null
  userAgent?: string | null
  actorId?: string | null
}

export interface ConsentResult {
  success: boolean
  error?: string
  errorCode?: string
  consent?: any
}

/**
 * Validates whether a given consent type is a supported enum value.
 */
export function isValidConsentType(type: unknown): type is SmsConsentType {
  return typeof type === 'string' && Object.values(SmsConsentType).includes(type as SmsConsentType)
}

/**
 * Validates whether a given consent source is a supported enum value.
 */
export function isValidConsentSource(source: unknown): source is SmsConsentSource {
  return typeof source === 'string' && Object.values(SmsConsentSource).includes(source as SmsConsentSource)
}

/**
 * Backwards-compatible recordConsent adapter.
 * If called with API_IMPORT, routes through provenance validation.
 * If called with MANUAL_ENTRY, classifies as STAFF_RECORDED (ineligible for commercial SMS).
 */
export async function recordConsent(input: RecordConsentInput): Promise<ConsentResult> {
  const { businessId, contact, consentType = SmsConsentType.EXPRESS_WRITTEN, consentSource = SmsConsentSource.CHECKOUT_FORM, disclosureText, ipAddress, userAgent, actorId } = input

  if (!businessId || !businessId.trim()) {
    return { success: false, errorCode: 'INVALID_BUSINESS_ID', error: 'Valid businessId is required.' }
  }

  const phoneResult = validateAndNormalizePhone(contact)
  if (!phoneResult.valid || !phoneResult.e164) {
    return { success: false, errorCode: 'INVALID_PHONE_NUMBER', error: phoneResult.error || 'Destination phone number is not valid.' }
  }
  const toE164 = phoneResult.e164

  if (!isValidConsentType(consentType)) {
    return {
      success: false,
      errorCode: 'INVALID_CONSENT_TYPE',
      error: `Invalid consent type: "${consentType}". Allowed types: ${Object.values(SmsConsentType).join(', ')}`,
    }
  }

  if (!isValidConsentSource(consentSource)) {
    return {
      success: false,
      errorCode: 'INVALID_CONSENT_SOURCE',
      error: `Invalid consent source: "${consentSource}". Allowed sources: ${Object.values(SmsConsentSource).join(', ')}`,
    }
  }

  if (!disclosureText || typeof disclosureText !== 'string' || disclosureText.trim().length < 10) {
    return { success: false, errorCode: 'DISCLOSURE_TEXT_REQUIRED', error: 'Verbatim disclosure text is required (minimum 10 characters).' }
  }

  // Handle API_IMPORT
  if (consentSource === SmsConsentSource.API_IMPORT || (consentSource as string) === 'API_IMPORT') {
    const importRes = await importConsentEvidence({
      businessId,
      items: [{
        contact: toE164,
        externalSystem: 'API_IMPORT',
        originalTimestamp: new Date(),
        originalDisclosureText: disclosureText,
        evidenceDescription: 'Direct recordConsent import call',
      }],
      actorId,
      ipAddress,
      userAgent,
    })

    const item = importRes.results[0]
    if (item && item.success) {
      const consent = await db.customerSmsConsent.findUnique({
        where: { businessId_contact: { businessId, contact: toE164 } },
      })
      return { success: true, consent }
    }
    return {
      success: false,
      errorCode: item?.errorCode || 'IMPORT_FAILED',
      error: item?.error || 'Failed to import consent evidence.',
    }
  }

  // Handle MANUAL_ENTRY (Cannot manufacture commercial EXPRESS_WRITTEN consent)
  if (consentSource === SmsConsentSource.MANUAL_ENTRY || (consentSource as string) === 'MANUAL_ENTRY') {
    const now = new Date()
    const consent = await db.customerSmsConsent.upsert({
      where: { businessId_contact: { businessId, contact: toE164 } },
      create: {
        businessId,
        contact: toE164,
        status: ConsentStatus.UNVERIFIED_LEGACY,
        consentType: SmsConsentType.EXPRESS_WRITTEN,
        consentSource: SmsConsentSource.STAFF_RECORDED,
        currentVersion: 'manual_entry',
        disclosureText: disclosureText.trim(),
        consentedAt: now,
      },
      update: {
        status: ConsentStatus.UNVERIFIED_LEGACY,
        consentSource: SmsConsentSource.STAFF_RECORDED,
        disclosureText: disclosureText.trim(),
      },
    })

    await db.customerSmsConsentEvent.create({
      data: {
        consentId: consent.id,
        businessId,
        contact: toE164,
        eventType: ConsentEventType.MIGRATED_LEGACY,
        consentType: SmsConsentType.EXPRESS_WRITTEN,
        consentSource: SmsConsentSource.STAFF_RECORDED,
        disclosureVersion: 'manual_entry',
        disclosureText: disclosureText.trim(),
        evidenceMetadata: JSON.stringify({ note: 'Staff manual entry (unverified)' }),
        actorId: actorId || null,
        occurredAt: now,
      },
    })

    return {
      success: true,
      consent,
    }
  }

  // Standard checkout form / direct customer flow
  const now = new Date()
  try {
    const existing = await db.customerSmsConsent.findUnique({
      where: { businessId_contact: { businessId, contact: toE164 } },
    })
    const eventType = existing && existing.status === ConsentStatus.REVOKED
      ? ConsentEventType.REGRANTED
      : ConsentEventType.GRANTED

    const consent = await db.customerSmsConsent.upsert({
      where: { businessId_contact: { businessId, contact: toE164 } },
      create: {
        businessId,
        contact: toE164,
        status: ConsentStatus.ACTIVE,
        consentType: consentType as any,
        consentSource: consentSource as any,
        currentVersion: DEFAULT_DISCLOSURE_VERSION,
        disclosureText: disclosureText.trim(),
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        consentedAt: now,
        revokedAt: null,
      },
      update: {
        status: ConsentStatus.ACTIVE,
        consentType: consentType as any,
        consentSource: consentSource as any,
        currentVersion: DEFAULT_DISCLOSURE_VERSION,
        disclosureText: disclosureText.trim(),
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        consentedAt: now,
        revokedAt: null,
      },
    })

    const event = await db.customerSmsConsentEvent.create({
      data: {
        consentId: consent.id,
        businessId,
        contact: toE164,
        eventType,
        consentType: consentType as any,
        consentSource: consentSource as any,
        disclosureVersion: DEFAULT_DISCLOSURE_VERSION,
        disclosureText: disclosureText.trim(),
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        actorId: actorId || null,
        occurredAt: now,
      },
    })

    await db.customerSmsConsent.update({
      where: { id: consent.id },
      data: { lastEventId: event.id },
    }).catch(() => {})

    // Audit Logging (PII-masked)
    const maskedPhone = toE164.slice(0, 4) + '****' + toE164.slice(-4)
    await db.auditLog.create({
      data: {
        actorId: actorId || null,
        action: 'sms.consent_granted',
        targetType: 'business',
        targetId: businessId,
        ip: ipAddress || null,
        metadata: JSON.stringify({
          businessId,
          contact: maskedPhone,
          consentType,
          consentSource,
          disclosureLength: disclosureText.trim().length,
          consentId: consent.id,
        }),
      },
    }).catch(() => {})

    return { success: true, consent }
  } catch (err: any) {
    return { success: false, errorCode: 'DATABASE_ERROR', error: err?.message }
  }
}
