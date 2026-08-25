// src/lib/sms/phone.ts — Strict E.164 phone validation and normalization using libphonenumber-js
import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js'

export interface PhoneValidationResult {
  valid: boolean
  e164?: string
  country?: string
  nationalFormat?: string
  error?: string
}

/**
 * Validates and normalizes any phone input into strict E.164 format (+1XXXXXXXXXX).
 * Supports US, CA, UK, AU, and international destinations.
 * Rejects malformed numbers, non-digits, and incomplete strings.
 */
export function validateAndNormalizePhone(
  input: unknown,
  defaultCountry: CountryCode = 'US'
): PhoneValidationResult {
  if (input === null || input === undefined) {
    return { valid: false, error: 'Phone number is required' }
  }

  const rawStr = String(input).trim()
  if (!rawStr) {
    return { valid: false, error: 'Phone number cannot be empty' }
  }

  try {
    // If the number starts with +, parse without default country override
    const parsed = rawStr.startsWith('+')
      ? parsePhoneNumberFromString(rawStr)
      : parsePhoneNumberFromString(rawStr, defaultCountry)

    if (!parsed || !parsed.isValid()) {
      return {
        valid: false,
        error: `Invalid phone number format: "${rawStr}"`,
      }
    }

    return {
      valid: true,
      e164: parsed.number, // Always in standard E.164 format e.g. +12125550199
      country: parsed.country,
      nationalFormat: parsed.formatNational(),
    }
  } catch (err) {
    return {
      valid: false,
      error: `Phone parsing failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
