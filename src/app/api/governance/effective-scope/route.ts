import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// GET /api/governance/effective-scope — Returns authenticated caller's effective scope
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  try {
    // Fetch user's assigned businesses details
    const permittedBusinesses = await db.business.findMany({
      where: { id: { in: ctx.businessIds } },
      select: { id: true, name: true, address: true, industry: true, avgRating: true, reviewCount: true },
    })

    // Fetch groups that user is assigned to or that contain user's businesses
    const groups = await db.locationGroup.findMany({
      where: { orgId: ctx.orgId },
      include: {
        locations: { select: { businessId: true } },
      },
    })

    const accessibleGroups = groups.filter((g) =>
      ctx.isOrgAdmin || g.locations.some((loc) => ctx.businessIds.includes(loc.businessId))
    )

    return NextResponse.json({
      scope: {
        userId: ctx.user.id,
        email: ctx.user.email,
        role: ctx.user.role,
        isOrgAdmin: ctx.isOrgAdmin,
        totalOrgLocations: ctx.allOrgBusinessIds.length,
        permittedLocationCount: ctx.businessIds.length,
        permittedBusinesses,
        accessibleGroups: accessibleGroups.map((g) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          locationCount: g.locations.length,
        })),
      },
    })
  } catch (error) {
    console.error('Failed to get effective scope:', error)
    return NextResponse.json({ error: 'Failed to retrieve effective scope' }, { status: 500 })
  }
}
