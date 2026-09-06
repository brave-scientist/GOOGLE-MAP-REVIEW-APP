import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// GET /api/businesses/[id] — Fetch details for a specific business
// SEC-01: Requires auth + verifies business belongs to caller's org.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params
  const denied = assertBusinessOwnership(ctx, id)
  if (denied) return denied

  try {
    const business = await db.business.findUnique({
      where: { id },
      select: {
        id: true,
        orgId: true,
        name: true,
        industry: true,
        address: true,
        phone: true,
        timezone: true,
        avgRating: true,
        reviewCount: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    return NextResponse.json({ business })
  } catch (error) {
    console.error('Error fetching business:', error)
    return NextResponse.json({ error: 'Failed to fetch business' }, { status: 500 })
  }
}

// PATCH /api/businesses/[id] — Update business profile details
// SEC-01: Requires auth + verifies caller's org owns this business.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params
  const denied = assertBusinessOwnership(ctx, id)
  if (denied) return denied

  try {
    const body = await request.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { name, industry, timezone, address, phone } = body

    const updateData: {
      name?: string
      industry?: string | null
      timezone?: string
      address?: string | null
      phone?: string | null
      updatedAt: Date
    } = {
      updatedAt: new Date(),
    }

    // Validate name if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({ error: 'Business name cannot be empty' }, { status: 400 })
      }
      if (name.trim().length > 100) {
        return NextResponse.json({ error: 'Business name cannot exceed 100 characters' }, { status: 400 })
      }
      updateData.name = name.trim()
    }

    // Validate industry if provided
    if (industry !== undefined) {
      if (industry === null || industry === '') {
        updateData.industry = null
      } else if (typeof industry === 'string') {
        if (industry.trim().length > 50) {
          return NextResponse.json({ error: 'Industry cannot exceed 50 characters' }, { status: 400 })
        }
        updateData.industry = industry.trim().toLowerCase()
      } else {
        return NextResponse.json({ error: 'Invalid industry value' }, { status: 400 })
      }
    }

    // Validate timezone if provided
    if (timezone !== undefined) {
      if (typeof timezone !== 'string' || timezone.trim().length === 0) {
        return NextResponse.json({ error: 'Timezone cannot be empty' }, { status: 400 })
      }
      if (timezone.trim().length > 50) {
        return NextResponse.json({ error: 'Timezone cannot exceed 50 characters' }, { status: 400 })
      }
      updateData.timezone = timezone.trim()
    }

    // Validate address if provided
    if (address !== undefined) {
      if (address === null || address === '') {
        updateData.address = null
      } else if (typeof address === 'string') {
        if (address.trim().length > 250) {
          return NextResponse.json({ error: 'Address cannot exceed 250 characters' }, { status: 400 })
        }
        updateData.address = address.trim()
      } else {
        return NextResponse.json({ error: 'Invalid address value' }, { status: 400 })
      }
    }

    // Validate phone if provided
    if (phone !== undefined) {
      if (phone === null || phone === '') {
        updateData.phone = null
      } else if (typeof phone === 'string') {
        if (phone.trim().length > 50) {
          return NextResponse.json({ error: 'Phone cannot exceed 50 characters' }, { status: 400 })
        }
        updateData.phone = phone.trim()
      } else {
        return NextResponse.json({ error: 'Invalid phone value' }, { status: 400 })
      }
    }

    const updatedBusiness = await db.business.update({
      where: { id },
      data: updateData,
    })

    // Record audit log
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'business.profile_updated',
        targetType: 'business',
        targetId: id,
        metadata: JSON.stringify({
          updatedFields: Object.keys(updateData).filter(k => k !== 'updatedAt'),
          businessName: updatedBusiness.name,
        }),
      },
    })

    return NextResponse.json({
      business: {
        id: updatedBusiness.id,
        name: updatedBusiness.name,
        industry: updatedBusiness.industry,
        address: updatedBusiness.address,
        phone: updatedBusiness.phone,
        timezone: updatedBusiness.timezone,
        avgRating: updatedBusiness.avgRating,
        reviewCount: updatedBusiness.reviewCount,
      },
      message: 'Business profile updated successfully',
    })
  } catch (error) {
    console.error('Error updating business:', error)
    return NextResponse.json({ error: 'Failed to update business profile' }, { status: 500 })
  }
}
