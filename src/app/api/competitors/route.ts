import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'

export const dynamic = 'force-dynamic'

// GET /api/competitors — list competitors for a business
export async function GET(request: NextRequest) {
  // SEC-01: require auth + PRO plan
  const ctx = await getTenantContext(request, 'PRO')
  if (ctx instanceof NextResponse) return ctx

  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    // SEC-01: if businessId is provided, verify ownership
    if (businessId) {
      const denied = assertBusinessOwnership(ctx, businessId)
      if (denied) return denied
    }

    // Return mock competitor data for demo
    return NextResponse.json({
      competitors: [
        { id: '1', name: 'Golden Dragon Restaurant', rating: 4.4, reviews: 312, velocity: 18, responseRate: 62, sentiment: 0.65 },
        { id: '2', name: 'Jade Palace', rating: 4.3, reviews: 198, velocity: 8, responseRate: 71, sentiment: 0.61 },
        { id: '3', name: 'Sakura Sushi Bar', rating: 4.7, reviews: 421, velocity: 22, responseRate: 92, sentiment: 0.78 },
      ],
    })
  } catch (error) {
    console.error('Competitors API error:', error)
    return NextResponse.json({ error: 'Failed to fetch competitors' }, { status: 500 })
  }
}

// POST /api/competitors — add a new competitor
export async function POST(request: NextRequest) {
  // SEC-01: require auth + PRO plan
  const ctx = await getTenantContext(request, 'PRO')
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = await request.json()
    const { name, businessId, googleMapsUrl } = body

    if (!name) {
      return NextResponse.json({ error: 'Competitor name is required' }, { status: 400 })
    }

    // SEC-01: if businessId is provided, verify ownership
    if (businessId) {
      const denied = assertBusinessOwnership(ctx, businessId)
      if (denied) return denied
    }

    // For demo, generate mock data
    const competitor = {
      id: `comp_${Date.now()}`,
      name,
      businessId: businessId || 'demo',
      googleMapsUrl: googleMapsUrl || null,
      rating: 4.0 + Math.random() * 0.8,
      reviews: Math.floor(Math.random() * 400) + 50,
      velocity: Math.floor(Math.random() * 25) + 3,
      responseRate: Math.floor(Math.random() * 50) + 40,
      sentiment: 0.4 + Math.random() * 0.4,
      addedAt: new Date().toISOString(),
    }

    // Log the action
    await db.auditLog.create({
      data: {
        actorId: ctx.user.id,
        action: 'competitor.added',
        targetType: 'competitor',
        targetId: competitor.id,
        metadata: JSON.stringify({ name, businessId, orgId: ctx.orgId }),
      },
    })

    return NextResponse.json({
      competitor,
      message: `${name} added. We'll start tracking their reviews weekly.`,
    })
  } catch (error) {
    console.error('Add competitor error:', error)
    return NextResponse.json({ error: 'Failed to add competitor' }, { status: 500 })
  }
}
