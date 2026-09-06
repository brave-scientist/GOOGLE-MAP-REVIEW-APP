import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { SYSTEM_PRESETS } from '@/lib/templates/presets'

export const dynamic = 'force-dynamic'

// GET /api/ai-presets — List system presets + custom presets for business
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request, 'STARTER')
  if (ctx instanceof NextResponse) return ctx

  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    let targetBusinessIds: string[] = []

    if (businessId) {
      const denied = assertBusinessOwnership(ctx, businessId)
      if (denied) return denied
      targetBusinessIds = [businessId]
    } else {
      targetBusinessIds = ctx.businessIds
    }

    let customPresets: any[] = []
    if (targetBusinessIds.length > 0) {
      customPresets = await db.aiReplyPreset.findMany({
        where: {
          businessId: { in: targetBusinessIds },
        },
        orderBy: [
          { isDefault: 'desc' },
          { createdAt: 'desc' },
        ],
        include: {
          business: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })
    }

    return NextResponse.json({
      systemPresets: SYSTEM_PRESETS,
      customPresets,
      presets: [
        ...SYSTEM_PRESETS.map(p => ({ ...p, isCustom: false })),
        ...customPresets.map(p => ({ ...p, isCustom: true })),
      ],
    })
  } catch (error) {
    console.error('Failed to list AI presets:', error)
    return NextResponse.json({ error: 'Failed to list AI presets' }, { status: 500 })
  }
}

// POST /api/ai-presets — Create custom fine-tuning preset
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request, 'STARTER')
  if (ctx instanceof NextResponse) return ctx

  if (ctx.user.role === 'VIEWER') {
    return NextResponse.json({ error: 'Read-only access: mutation not permitted' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { businessId, name, description, tone, responseLength, customInstructions, signature, isDefault } = body

    if (!businessId || typeof businessId !== 'string') {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
    }

    const denied = assertBusinessOwnership(ctx, businessId)
    if (denied) return denied

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    if (!tone || typeof tone !== 'string' || tone.trim() === '') {
      return NextResponse.json({ error: 'tone is required' }, { status: 400 })
    }

    const validLengths = ['CONCISE', 'BALANCED', 'DETAILED']
    const cleanLength = responseLength && validLengths.includes(String(responseLength).toUpperCase())
      ? String(responseLength).toUpperCase()
      : 'BALANCED'

    const setAsDefault = Boolean(isDefault)

    if (setAsDefault) {
      await db.aiReplyPreset.updateMany({
        where: { businessId, isDefault: true },
        data: { isDefault: false },
      })
    }

    const preset = await db.aiReplyPreset.create({
      data: {
        businessId,
        name: name.trim(),
        description: description ? String(description).trim() : null,
        tone: tone.trim(),
        responseLength: cleanLength,
        customInstructions: customInstructions ? String(customInstructions).trim() : null,
        signature: signature ? String(signature).trim() : null,
        isDefault: setAsDefault,
      },
    })

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'ai_preset.created',
        targetType: 'ai_reply_preset',
        targetId: preset.id,
        metadata: JSON.stringify({
          businessId,
          name: preset.name,
          tone: preset.tone,
          responseLength: preset.responseLength,
          isDefault: preset.isDefault,
        }),
      },
    })

    return NextResponse.json({ preset }, { status: 201 })
  } catch (error) {
    console.error('Failed to create AI preset:', error)
    return NextResponse.json({ error: 'Failed to create AI preset' }, { status: 500 })
  }
}
