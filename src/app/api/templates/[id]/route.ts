import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { validateTemplate } from '@/lib/templates/token-engine'

export const dynamic = 'force-dynamic'

// GET /api/templates/[id] — Retrieve single template
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request, 'STARTER')
  if (ctx instanceof NextResponse) return ctx

  try {
    const { id } = await params
    const template = await db.replyTemplate.findUnique({
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

    // Anti-IDOR: fail closed if template doesn't exist or business is not in caller's org
    if (!template || !ctx.businessIds.includes(template.businessId)) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    return NextResponse.json({ template })
  } catch (error) {
    console.error('Failed to get template:', error)
    return NextResponse.json({ error: 'Failed to get template' }, { status: 500 })
  }
}

// PUT /api/templates/[id] — Update template
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
    const template = await db.replyTemplate.findUnique({
      where: { id },
    })

    if (!template || !ctx.businessIds.includes(template.businessId)) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const { title, body: templateBody, category, language, isDefault } = body

    const updateData: any = {}

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim() === '') {
        return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 })
      }
      updateData.title = title.trim()
    }

    if (templateBody !== undefined) {
      if (typeof templateBody !== 'string' || templateBody.trim() === '') {
        return NextResponse.json({ error: 'body cannot be empty' }, { status: 400 })
      }
      const validation = validateTemplate(templateBody)
      if (!validation.valid) {
        return NextResponse.json({ error: validation.errors.join('; ') }, { status: 400 })
      }
      updateData.body = templateBody.trim()
    }

    if (category !== undefined) {
      updateData.category = category ? String(category).toUpperCase().trim() : null
    }

    if (language !== undefined) {
      updateData.language = language ? String(language).toLowerCase().trim() : 'en'
    }

    if (isDefault !== undefined) {
      const setAsDefault = Boolean(isDefault)
      updateData.isDefault = setAsDefault

      if (setAsDefault) {
        const cat = updateData.category !== undefined ? updateData.category : template.category
        await db.replyTemplate.updateMany({
          where: {
            businessId: template.businessId,
            id: { not: template.id },
            ...(cat ? { category: cat } : {}),
            isDefault: true,
          },
          data: { isDefault: false },
        })
      }
    }

    const updated = await db.replyTemplate.update({
      where: { id },
      data: updateData,
    })

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'template.updated',
        targetType: 'reply_template',
        targetId: updated.id,
        metadata: JSON.stringify({
          businessId: updated.businessId,
          title: updated.title,
          category: updated.category,
          isDefault: updated.isDefault,
        }),
      },
    })

    return NextResponse.json({ template: updated })
  } catch (error) {
    console.error('Failed to update template:', error)
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  }
}

// DELETE /api/templates/[id] — Delete template
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
    const template = await db.replyTemplate.findUnique({
      where: { id },
    })

    if (!template || !ctx.businessIds.includes(template.businessId)) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    await db.replyTemplate.delete({
      where: { id },
    })

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'template.deleted',
        targetType: 'reply_template',
        targetId: id,
        metadata: JSON.stringify({
          businessId: template.businessId,
          title: template.title,
        }),
      },
    })

    return NextResponse.json({ success: true, message: 'Template deleted' })
  } catch (error) {
    console.error('Failed to delete template:', error)
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
}
