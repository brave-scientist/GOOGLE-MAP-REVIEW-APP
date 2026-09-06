import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'
import { SYSTEM_PRESETS } from '@/lib/templates/presets'

export const dynamic = 'force-dynamic'

// GET /api/ai-presets/[id] — Retrieve single AI preset
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request, 'STARTER')
  if (ctx instanceof NextResponse) return ctx

  try {
    const { id } = await params

    // Check system presets first
    const sys = SYSTEM_PRESETS.find(p => p.id === id)
    if (sys) {
      return NextResponse.json({ preset: { ...sys, isCustom: false } })
    }

    const preset = await db.aiReplyPreset.findUnique({
      where: { id },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            orgId: true,
          },
        },
      },
    })

    // Anti-IDOR check
    if (!preset || !ctx.businessIds.includes(preset.businessId)) {
      return NextResponse.json({ error: 'AI preset not found' }, { status: 404 })
    }

    return NextResponse.json({ preset: { ...preset, isCustom: true } })
  } catch (error) {
    console.error('Failed to get AI preset:', error)
    return NextResponse.json({ error: 'Failed to get AI preset' }, { status: 500 })
  }
}

// PUT /api/ai-presets/[id] — Update custom preset
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request, 'STARTER')
  if (ctx instanceof NextResponse) return ctx

  if (ctx.user.role === 'VIEWER') {
    return NextResponse.json({ error: 'Read-only access: mutation not permitted' }, { status: 403 })
  }

  try {
    const { id } = await params

    // Protect system presets from direct mutation
    if (id.startsWith('sys_preset_')) {
      return NextResponse.json({ error: 'System presets cannot be modified directly' }, { status: 400 })
    }

    const preset = await db.aiReplyPreset.findUnique({
      where: { id },
    })

    if (!preset || !ctx.businessIds.includes(preset.businessId)) {
      return NextResponse.json({ error: 'AI preset not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const { name, description, tone, responseLength, customInstructions, signature, isDefault } = body

    const updateData: any = {}

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
      }
      updateData.name = name.trim()
    }

    if (description !== undefined) {
      updateData.description = description ? String(description).trim() : null
    }

    if (tone !== undefined) {
      if (typeof tone !== 'string' || tone.trim() === '') {
        return NextResponse.json({ error: 'tone cannot be empty' }, { status: 400 })
      }
      updateData.tone = tone.trim()
    }

    if (responseLength !== undefined) {
      const validLengths = ['CONCISE', 'BALANCED', 'DETAILED']
      updateData.responseLength = validLengths.includes(String(responseLength).toUpperCase())
        ? String(responseLength).toUpperCase()
        : 'BALANCED'
    }

    if (customInstructions !== undefined) {
      updateData.customInstructions = customInstructions ? String(customInstructions).trim() : null
    }

    if (signature !== undefined) {
      updateData.signature = signature ? String(signature).trim() : null
    }

    if (isDefault !== undefined) {
      const setAsDefault = Boolean(isDefault)
      updateData.isDefault = setAsDefault

      if (setAsDefault) {
        await db.aiReplyPreset.updateMany({
          where: {
            businessId: preset.businessId,
            id: { not: preset.id },
            isDefault: true,
          },
          data: { isDefault: false },
        })
      }
    }

    const updated = await db.aiReplyPreset.update({
      where: { id },
      data: updateData,
    })

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'ai_preset.updated',
        targetType: 'ai_reply_preset',
        targetId: updated.id,
        metadata: JSON.stringify({
          businessId: updated.businessId,
          name: updated.name,
          isDefault: updated.isDefault,
        }),
      },
    })

    return NextResponse.json({ preset: updated })
  } catch (error) {
    console.error('Failed to update AI preset:', error)
    return NextResponse.json({ error: 'Failed to update AI preset' }, { status: 500 })
  }
}

// DELETE /api/ai-presets/[id] — Delete custom preset
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request, 'STARTER')
  if (ctx instanceof NextResponse) return ctx

  if (ctx.user.role === 'VIEWER') {
    return NextResponse.json({ error: 'Read-only access: mutation not permitted' }, { status: 403 })
  }

  try {
    const { id } = await params

    if (id.startsWith('sys_preset_')) {
      return NextResponse.json({ error: 'System presets cannot be deleted' }, { status: 400 })
    }

    const preset = await db.aiReplyPreset.findUnique({
      where: { id },
    })

    if (!preset || !ctx.businessIds.includes(preset.businessId)) {
      return NextResponse.json({ error: 'AI preset not found' }, { status: 404 })
    }

    await db.aiReplyPreset.delete({
      where: { id },
    })

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'ai_preset.deleted',
        targetType: 'ai_reply_preset',
        targetId: id,
        metadata: JSON.stringify({
          businessId: preset.businessId,
          name: preset.name,
        }),
      },
    })

    return NextResponse.json({ success: true, message: 'AI preset deleted' })
  } catch (error) {
    console.error('Failed to delete AI preset:', error)
    return NextResponse.json({ error: 'Failed to delete AI preset' }, { status: 500 })
  }
}
