// src/lib/sms/consent.ts — Affirmative SMS Consent Ledger & Verification
// SMS-002: Durable proof of affirmative express written consent before dispatch
import { db } from '@/lib/db'
import { validateAndNormalizePhone } from './phone'

export enum SmsConsentType {
  EXPRESS_WRITTEN = 'EXPRESS_WRITTEN',
  TRANSACTIONAL = 'TRANSACTIONAL',
  IMPLIED = 'IMPLIED',
}

export enum SmsConsentSource {
  CHECKOUT_FORM = 'CHECKOUT_FORM',
  IN_PERSON_KIOSK = 'IN_PERSON_KIOSK',
  API_IMPORT = 'API_IMPORT',
  WEBSITE_FORM = 'WEBSITE_FORM',
  MANUAL_ENTRY = 'MANUAL_ENTRY',
}

/**
 * Controlled list of consent types permitted for commercial review-request SMS dispatches.
 * Under TCPA/CTIA policy, commercial review requests strictly require EXPRESS_WRITTEN consent.
 */
export const ALLOWED_COMMERCIAL_CONSENT_TYPES: readonly SmsConsentType[] = [
  SmsConsentType.EXPRESS_WRITTEN,
]

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

export interface RevokeConsentInput {
  businessId: string
  contact: string
  reason?: string
  actorId?: string | null
}

export interface ConsentResult {
  success: boolean
  error?: string
  errorCode?: string
  consent?: {
    id: string
    businessId: string
    contact: string
    consentType: string
    consentSource: string
    disclosureText: string
    ipAddress?: string | null
    userAgent?: string | null
    consentedAt: Date
    revokedAt?: Date | null
  }
}

/**
 * Generates the standardized, compliant disclosure text for a given business.
 */
export function getDefaultSmsDisclosureText(businessName: string): string {
  const name = businessName.trim() || 'ReviewReply'
  return `By providing your phone number, you agree to receive text messages from ${name} regarding review requests and customer feedback. Message and data rates may apply. Message frequency varies. Reply STOP to opt out, HELP for help.`
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
 * Records or updates affirmative SMS consent for a contact and business.
 *
 * Rules:
 * 1. Destination contact must normalize to valid E.164.
 * 2. Consent type must be a valid controlled enum.
 * 3. Consent source must be a valid controlled enum.
 * 4. Disclosure text must be non-empty and capture the verbatim opt-in agreement.
 * 5. Re-granting consent on a previously revoked record resets `revokedAt` to null and
 *    updates `consentedAt` to server-generated `now()`.
 * 6. Emits an audit event (`sms.consent_granted`) with masked PII.
 */
export async function recordConsent(input: RecordConsentInput): Promise<ConsentResult> {
  const {
    businessId,
    contact,
    consentType = SmsConsentType.EXPRESS_WRITTEN,
    consentSource = SmsConsentSource.CHECKOUT_FORM,
    disclosureText,
    ipAddress,
    userAgent,
    actorId,
  } = input

  if (!businessId || typeof businessId !== 'string' || !businessId.trim()) {
    return { success: false, errorCode: 'INVALID_BUSINESS_ID', error: 'Valid businessId is required.' }
  }

  // 1. Phone Normalization (E.164)
  const phoneResult = validateAndNormalizePhone(contact)
  if (!phoneResult.valid || !phoneResult.e164) {
    return {
      success: false,
      errorCode: 'INVALID_PHONE_NUMBER',
      error: phoneResult.error || 'Destination phone number is not valid.',
    }
  }
  const toE164 = phoneResult.e164

  // 2. Validate Consent Type
  if (!isValidConsentType(consentType)) {
    return {
      success: false,
      errorCode: 'INVALID_CONSENT_TYPE',
      error: `Invalid consent type: "${consentType}". Allowed types: ${Object.values(SmsConsentType).join(', ')}`,
    }
  }

  // 3. Validate Consent Source
  if (!isValidConsentSource(consentSource)) {
    return {
      success: false,
      errorCode: 'INVALID_CONSENT_SOURCE',
      error: `Invalid consent source: "${consentSource}". Allowed sources: ${Object.values(SmsConsentSource).join(', ')}`,
    }
  }

  // 4. Validate Disclosure Text Integrity
  if (!disclosureText || typeof disclosureText !== 'string' || disclosureText.trim().length < 10) {
    return {
      success: false,
      errorCode: 'DISCLOSURE_TEXT_REQUIRED',
      error: 'Verbatim disclosure text is required (minimum 10 characters).',
    }
  }

  const cleanDisclosure = disclosureText.trim()

  try {
    // 5. Upsert consent record (E.164 uniqueness per business)
    const consent = await db.customerSmsConsent.upsert({
      where: {
        businessId_contact: {
          businessId,
          contact: toE164,
        },
      },
      create: {
        businessId,
        contact: toE164,
        consentType: consentType as any,
        consentSource: consentSource as any,
        disclosureText: cleanDisclosure,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        consentedAt: new Date(),
        revokedAt: null,
      },
      update: {
        consentType: consentType as any,
        consentSource: consentSource as any,
        disclosureText: cleanDisclosure,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        consentedAt: new Date(),
        revokedAt: null, // Clear revocation on re-affirmation
      },
    })

    // 6. Audit Logging (PII-masked)
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
          disclosureLength: cleanDisclosure.length,
          consentId: consent.id,
        }),
      },
    }).catch(() => {})

    return {
      success: true,
      consent,
    }
  } catch (err: any) {
    console.error('[SMS-CONSENT] Failed to record consent:', err)
    return {
      success: false,
      errorCode: 'DATABASE_ERROR',
      error: err?.message || 'Failed to persist SMS consent record.',
    }
  }
}

/**
 * Explicitly revokes SMS consent for a contact and business.
 *
 * Rules:
 * 1. Sets `revokedAt` timestamp to preserve historical evidence.
 * 2. Does NOT delete or alter historical `disclosureText` or `consentedAt`.
 * 3. Emits an audit event (`sms.consent_revoked`) with masked PII.
 */
export async function revokeConsent(input: RevokeConsentInput): Promise<ConsentResult> {
  const { businessId, contact, reason, actorId } = input

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

    if (existing.revokedAt) {
      return {
        success: true,
        consent: existing,
      }
    }

    const updated = await db.customerSmsConsent.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    })

    // Audit Logging
    const maskedPhone = toE164.slice(0, 4) + '****' + toE164.slice(-4)
    await db.auditLog.create({
      data: {
        actorId: actorId || null,
        action: 'sms.consent_revoked',
        targetType: 'business',
        targetId: businessId,
        metadata: JSON.stringify({
          businessId,
          contact: maskedPhone,
          reason: reason || 'explicit_revocation',
          consentId: existing.id,
        }),
      },
    }).catch(() => {})

    return {
      success: true,
      consent: updated,
    }
  } catch (err: any) {
    console.error('[SMS-CONSENT] Failed to revoke consent:', err)
    return {
      success: false,
      errorCode: 'DATABASE_ERROR',
      error: err?.message || 'Failed to revoke SMS consent record.',
    }
  }
}

/**
 * Verifies whether an active, unrevoked affirmative consent record exists for a business and contact.
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

  const consent = await db.customerSmsConsent.findUnique({
    where: {
      businessId_contact: {
        businessId,
        contact: toE164,
      },
    },
    select: {
      id: true,
      consentType: true,
      revokedAt: true,
    },
  }).catch(() => null)

  if (!consent || consent.revokedAt !== null) {
    return false
  }

  return allowedTypes.includes(consent.consentType as SmsConsentType)
}

/**
 * Retrieves the full consent record for a contact and business.
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
  }).catch(() => null)
}
