import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { SYSTEM_PRESETS } from '@/lib/templates/presets'

export const dynamic = 'force-dynamic'

// POST /api/ai-presets/[id]/set-default — Set preset as default for business
export async function POST(
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
    const body = await request.json().catch(() => ({}))
    const { businessId } = body

    if (!businessId || typeof businessId !== 'string') {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
    }

    const denied = assertBusinessOwnership(ctx, businessId)
    if (denied) return denied

    // If it's a system preset, create or set a custom clone marked as default
    if (id.startsWith('sys_preset_')) {
      const sys = SYSTEM_PRESETS.find(p => p.id === id)
      if (!sys) {
        return NextResponse.json({ error: 'System preset not found' }, { status: 404 })
      }

      await db.aiReplyPreset.updateMany({
        where: { businessId, isDefault: true },
        data: { isDefault: false },
      })

      const cloned = await db.aiReplyPreset.create({
        data: {
          businessId,
          name: sys.name,
          description: sys.description,
          tone: sys.tone,
          responseLength: sys.responseLength,
          customInstructions: sys.customInstructions,
          isDefault: true,
        },
      })

      await db.auditLog.create({
        data: {
          actorId: ctx.user.id,
          action: 'ai_preset.default_set',
          targetType: 'ai_reply_preset',
          targetId: cloned.id,
          metadata: JSON.stringify({ businessId, systemPresetId: id }),
        },
      })

      return NextResponse.json({ preset: cloned, message: `${sys.name} set as default` })
    }

    // Custom preset
    const preset = await db.aiReplyPreset.findUnique({
      where: { id },
    })

    if (!preset || !ctx.businessIds.includes(preset.businessId)) {
      return NextResponse.json({ error: 'AI preset not found' }, { status: 404 })
    }

    await db.aiReplyPreset.updateMany({
      where: { businessId: preset.businessId, isDefault: true },
      data: { isDefault: false },
    })

    const updated = await db.aiReplyPreset.update({
      where: { id },
      data: { isDefault: true },
    })

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'ai_preset.default_set',
        targetType: 'ai_reply_preset',
        targetId: updated.id,
        metadata: JSON.stringify({ businessId: updated.businessId, name: updated.name }),
      },
    })

    return NextResponse.json({ preset: updated, message: `${updated.name} set as default` })
  } catch (error) {
    console.error('Failed to set default AI preset:', error)
    return NextResponse.json({ error: 'Failed to set default AI preset' }, { status: 500 })
  }
}
