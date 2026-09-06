import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { validateTemplate } from '@/lib/templates/token-engine'

export const dynamic = 'force-dynamic'

// GET /api/templates — List reply templates for a business or org
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request, 'STARTER')
  if (ctx instanceof NextResponse) return ctx

  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')
    const category = searchParams.get('category')
    const language = searchParams.get('language')

    let targetBusinessIds: string[] = []

    if (businessId) {
      const denied = assertBusinessOwnership(ctx, businessId)
      if (denied) return denied
      targetBusinessIds = [businessId]
    } else {
      targetBusinessIds = ctx.businessIds
    }

    if (targetBusinessIds.length === 0) {
      return NextResponse.json({ templates: [] })
    }

    const where: any = {
      businessId: { in: targetBusinessIds },
    }

    if (category) {
      where.category = category.toUpperCase()
    }
    if (language) {
      where.language = language
    }

    const templates = await db.replyTemplate.findMany({
      where,
      orderBy: [
        { isDefault: 'desc' },
        { usageCount: 'desc' },
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

    return NextResponse.json({ templates })
  } catch (error) {
    console.error('Failed to list reply templates:', error)
    return NextResponse.json({ error: 'Failed to list reply templates' }, { status: 500 })
  }
}

// POST /api/templates — Create a new reply template
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext(request, 'STARTER')
  if (ctx instanceof NextResponse) return ctx

  if (ctx.user.role === 'VIEWER') {
    return NextResponse.json({ error: 'Read-only access: mutation not permitted' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { businessId, title, body: templateBody, category, language, isDefault } = body

    if (!businessId || typeof businessId !== 'string') {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
    }

    const denied = assertBusinessOwnership(ctx, businessId)
    if (denied) return denied

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return NextResponse.json({ error: 'title is required and cannot be empty' }, { status: 400 })
    }

    if (!templateBody || typeof templateBody !== 'string' || templateBody.trim() === '') {
      return NextResponse.json({ error: 'body is required and cannot be empty' }, { status: 400 })
    }

    // Validate template syntax
    const validation = validateTemplate(templateBody)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.errors.join('; ') }, { status: 400 })
    }

    const cleanCategory = category ? String(category).toUpperCase().trim() : null
    const cleanLanguage = language ? String(language).toLowerCase().trim() : 'en'
    const setAsDefault = Boolean(isDefault)

    // If set as default, unset other defaults in the same business and category
    if (setAsDefault) {
      await db.replyTemplate.updateMany({
        where: {
          businessId,
          ...(cleanCategory ? { category: cleanCategory } : {}),
          isDefault: true,
        },
        data: { isDefault: false },
      })
    }

    const template = await db.replyTemplate.create({
      data: {
        businessId,
        title: title.trim(),
        body: templateBody.trim(),
        category: cleanCategory,
        language: cleanLanguage,
        isDefault: setAsDefault,
      },
    })

    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'template.created',
        targetType: 'reply_template',
        targetId: template.id,
        metadata: JSON.stringify({
          businessId,
          title: template.title,
          category: template.category,
          isDefault: template.isDefault,
        }),
      },
    })

    return NextResponse.json({ template }, { status: 201 })
  } catch (error) {
    console.error('Failed to create reply template:', error)
    return NextResponse.json({ error: 'Failed to create reply template' }, { status: 500 })
  }
}
