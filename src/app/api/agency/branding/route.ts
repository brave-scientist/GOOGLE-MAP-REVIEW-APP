import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'
import { isOrgAdminRole } from '@/lib/operator-governance'
import { assertEntitlement } from '@/lib/billing'

export const dynamic = 'force-dynamic'

const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

function isValidUrl(val: string): boolean {
  if (typeof val !== 'string') return false
  const trimmed = val.trim()
  if (trimmed.length === 0 || trimmed.length > 2000) return false
  // Reject dangerous protocols
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return false
  }
  // Allow safe relative paths (e.g. /logos/agency.png) but disallow protocol-relative URLs (//evil.com)
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return true
  }
  // Validate absolute URL format
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Strict boolean parser.
 * Specifically prevents JavaScript truthy coercion (e.g. Boolean("false") === true).
 */
function parseStrictBoolean(val: unknown): { valid: true; value: boolean } | { valid: false } {
  if (typeof val === 'boolean') {
    return { valid: true, value: val }
  }
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase()
    if (lower === 'true' || lower === '1') return { valid: true, value: true }
    if (lower === 'false' || lower === '0') return { valid: true, value: false }
  }
  return { valid: false }
}

// GET /api/agency/branding — Retrieve agency branding configuration for caller's organization
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    const branding = await db.agencyBranding.findUnique({
      where: { orgId: ctx.orgId },
    })

    return NextResponse.json({
      branding: branding || {
        orgId: ctx.orgId,
        brandName: ctx.user.orgName || 'Agency Portal',
        logoUrl: null,
        faviconUrl: null,
        primaryColor: '#1E40AF',
        accentColor: '#3B82F6',
        supportEmail: ctx.user.email,
        portalTitle: `${ctx.user.orgName || 'Agency'} Client Portal`,
        hideReviewReplyBadge: false,
        emailSenderName: ctx.user.orgName || 'Review Team',
        replyToEmail: ctx.user.email,
      },
    })
  } catch (error: any) {
    console.error('[AGENCY_BRANDING_GET_ERROR]', error)
    return NextResponse.json({ error: 'Failed to retrieve branding settings' }, { status: 500 })
  }
}

// PUT /api/agency/branding — Upsert agency branding configuration for caller's organization
export async function PUT(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  // SEC-02: Only organization administrators (OWNER, ADMIN, AGENCY_ADMIN) can modify agency branding
  if (!isOrgAdminRole(ctx.user.role)) {
    return NextResponse.json(
      { error: 'Only organization administrators can modify agency branding settings', code: 'INSUFFICIENT_ROLE' },
      { status: 403 }
    )
  }

  // Commercial entitlement check
  const entitlementCheck = await assertEntitlement(ctx.orgId, 'white_label_branding')
  if (!entitlementCheck.allowed) {
    return NextResponse.json(
      {
        error: entitlementCheck.reason || 'White-label agency branding requires an Enterprise or Agency plan',
        code: entitlementCheck.code || 'PLAN_UPGRADE_REQUIRED',
      },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const {
      brandName,
      logoUrl,
      faviconUrl,
      primaryColor,
      accentColor,
      supportEmail,
      portalTitle,
      hideReviewReplyBadge,
      emailSenderName,
      replyToEmail,
    } = body

    // Validation: Hex colors
    if (primaryColor !== undefined && primaryColor !== null) {
      if (typeof primaryColor !== 'string' || !HEX_COLOR_REGEX.test(primaryColor.trim())) {
        return NextResponse.json({ error: 'Invalid primaryColor hex format (e.g. #1E40AF)', code: 'INVALID_COLOR' }, { status: 400 })
      }
    }
    if (accentColor !== undefined && accentColor !== null) {
      if (typeof accentColor !== 'string' || !HEX_COLOR_REGEX.test(accentColor.trim())) {
        return NextResponse.json({ error: 'Invalid accentColor hex format (e.g. #3B82F6)', code: 'INVALID_COLOR' }, { status: 400 })
      }
    }

    // Validation: URLs
    if (logoUrl !== undefined && logoUrl !== null && typeof logoUrl === 'string' && logoUrl.trim().length > 0) {
      if (!isValidUrl(logoUrl.trim())) {
        return NextResponse.json({ error: 'Invalid logoUrl. Must be a valid HTTP/HTTPS URL or relative path', code: 'INVALID_URL' }, { status: 400 })
      }
    }
    if (faviconUrl !== undefined && faviconUrl !== null && typeof faviconUrl === 'string' && faviconUrl.trim().length > 0) {
      if (!isValidUrl(faviconUrl.trim())) {
        return NextResponse.json({ error: 'Invalid faviconUrl. Must be a valid HTTP/HTTPS URL or relative path', code: 'INVALID_URL' }, { status: 400 })
      }
    }

    // Validation: Emails
    if (supportEmail !== undefined && supportEmail !== null && typeof supportEmail === 'string' && supportEmail.trim().length > 0) {
      if (!EMAIL_REGEX.test(supportEmail.trim()) || supportEmail.trim().length > 254) {
        return NextResponse.json({ error: 'Invalid supportEmail format', code: 'INVALID_EMAIL' }, { status: 400 })
      }
    }
    if (replyToEmail !== undefined && replyToEmail !== null && typeof replyToEmail === 'string' && replyToEmail.trim().length > 0) {
      if (!EMAIL_REGEX.test(replyToEmail.trim()) || replyToEmail.trim().length > 254) {
        return NextResponse.json({ error: 'Invalid replyToEmail format', code: 'INVALID_EMAIL' }, { status: 400 })
      }
    }

    // Validation: Strict Booleans
    let cleanHideBadge: boolean | undefined = undefined
    if (hideReviewReplyBadge !== undefined && hideReviewReplyBadge !== null) {
      const parsed = parseStrictBoolean(hideReviewReplyBadge)
      if (!parsed.valid) {
        return NextResponse.json(
          { error: 'Invalid hideReviewReplyBadge. Must be a valid boolean value (true or false)', code: 'INVALID_BOOLEAN' },
          { status: 400 }
        )
      }
      cleanHideBadge = parsed.value
    }

    const cleanData = {
      brandName: typeof brandName === 'string' ? brandName.trim().slice(0, 100) : (brandName === null ? null : undefined),
      logoUrl: typeof logoUrl === 'string' ? logoUrl.trim() : (logoUrl === null ? null : undefined),
      faviconUrl: typeof faviconUrl === 'string' ? faviconUrl.trim() : (faviconUrl === null ? null : undefined),
      primaryColor: typeof primaryColor === 'string' ? primaryColor.trim() : undefined,
      accentColor: typeof accentColor === 'string' ? accentColor.trim() : undefined,
      supportEmail: typeof supportEmail === 'string' ? supportEmail.trim() : (supportEmail === null ? null : undefined),
      portalTitle: typeof portalTitle === 'string' ? portalTitle.trim().slice(0, 150) : (portalTitle === null ? null : undefined),
      hideReviewReplyBadge: cleanHideBadge,
      emailSenderName: typeof emailSenderName === 'string' ? emailSenderName.trim().slice(0, 100) : (emailSenderName === null ? null : undefined),
      replyToEmail: typeof replyToEmail === 'string' ? replyToEmail.trim() : (replyToEmail === null ? null : undefined),
    }

    const branding = await db.agencyBranding.upsert({
      where: { orgId: ctx.orgId },
      create: {
        orgId: ctx.orgId,
        brandName: cleanData.brandName ?? null,
        logoUrl: cleanData.logoUrl ?? null,
        faviconUrl: cleanData.faviconUrl ?? null,
        primaryColor: cleanData.primaryColor || '#1E40AF',
        accentColor: cleanData.accentColor || '#3B82F6',
        supportEmail: cleanData.supportEmail ?? null,
        portalTitle: cleanData.portalTitle ?? null,
        hideReviewReplyBadge: cleanData.hideReviewReplyBadge ?? false,
        emailSenderName: cleanData.emailSenderName ?? null,
        replyToEmail: cleanData.replyToEmail ?? null,
      },
      update: {
        ...(cleanData.brandName !== undefined && { brandName: cleanData.brandName }),
        ...(cleanData.logoUrl !== undefined && { logoUrl: cleanData.logoUrl }),
        ...(cleanData.faviconUrl !== undefined && { faviconUrl: cleanData.faviconUrl }),
        ...(cleanData.primaryColor !== undefined && { primaryColor: cleanData.primaryColor }),
        ...(cleanData.accentColor !== undefined && { accentColor: cleanData.accentColor }),
        ...(cleanData.supportEmail !== undefined && { supportEmail: cleanData.supportEmail }),
        ...(cleanData.portalTitle !== undefined && { portalTitle: cleanData.portalTitle }),
        ...(cleanData.hideReviewReplyBadge !== undefined && { hideReviewReplyBadge: cleanData.hideReviewReplyBadge }),
        ...(cleanData.emailSenderName !== undefined && { emailSenderName: cleanData.emailSenderName }),
        ...(cleanData.replyToEmail !== undefined && { replyToEmail: cleanData.replyToEmail }),
      },
    })

    // Audit log (sanitized)
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'branding.updated',
        targetType: 'agency_branding',
        targetId: branding.id,
        metadata: JSON.stringify({
          brandName: branding.brandName,
          primaryColor: branding.primaryColor,
          accentColor: branding.accentColor,
          hideReviewReplyBadge: branding.hideReviewReplyBadge,
        }),
      },
    })

    return NextResponse.json({ branding })
  } catch (error: any) {
    console.error('[AGENCY_BRANDING_PUT_ERROR]', error?.message || 'Unknown error')
    return NextResponse.json({ error: 'Failed to update branding settings' }, { status: 500 })
  }
}
