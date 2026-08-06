import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Plan } from '@prisma/client'

export const dynamic = 'force-dynamic'

// GET /api/admin — Developer/owner dashboard stats
// In production, this would check for owner role
export async function GET(request: NextRequest) {
  try {
    // Get all users
    const totalUsers = await db.user.count()
    const totalOrgs = await db.organization.count()
    const totalBusinesses = await db.business.count()

    // Users by plan
    const orgsByPlan = await db.organization.groupBy({
      by: ['plan'],
      _count: true,
    })
    const planBreakdown = {
      free: orgsByPlan.find(o => o.plan === Plan.FREE)?._count || 0,
      starter: orgsByPlan.find(o => o.plan === Plan.STARTER)?._count || 0,
      pro: orgsByPlan.find(o => o.plan === Plan.PRO)?._count || 0,
      enterprise: orgsByPlan.find(o => o.plan === Plan.ENTERPRISE)?._count || 0,
      agency: orgsByPlan.find(o => o.plan === Plan.AGENCY)?._count || 0,
    }

    // Trial users
    const now = new Date()
    const trialOrgs = await db.organization.findMany({
      where: {
        trialEndsAt: { gt: now },
      },
      select: { id: true, name: true, trialEndsAt: true, createdAt: true },
    })

    // Paid subscribers (any plan except FREE)
    const paidSubscribers = await db.organization.count({
      where: { plan: { not: Plan.FREE } },
    })

    // Recent signups (last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const recentSignups = await db.user.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      include: {
        memberships: {
          include: {
            org: { select: { name: true, plan: true, trialEndsAt: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    // Revenue calculation (mock — based on plan)
    const planPrices: Record<string, number> = {
      [Plan.FREE]: 0,
      [Plan.STARTER]: 49,
      [Plan.PRO]: 99,
      [Plan.ENTERPRISE]: 299,
      [Plan.AGENCY]: 499,
    }
    const orgs = await db.organization.findMany()
    let mrr = 0
    for (const org of orgs) {
      // Only count if trial is over OR plan is FREE
      if (org.trialEndsAt && org.trialEndsAt > now && org.plan !== Plan.FREE) {
        // Still in trial — don't count
        continue
      }
      mrr += planPrices[org.plan] || 0
    }

    // Usage stats
    const totalReviews = await db.review.count()
    const totalDrafts = await db.review.count({ where: { draftStatus: 'POSTED' } })
    const totalCampaigns = await db.campaign.count()
    const totalRequests = await db.reviewRequest.count()

    // Reviews by source
    const reviewsBySource = await db.review.groupBy({
      by: ['source'],
      _count: true,
    })

    // Signups over last 14 days (for chart)
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
    const recentUsers = await db.user.findMany({
      where: { createdAt: { gte: fourteenDaysAgo } },
      select: { createdAt: true },
    })
    const signupsByDay: { date: string; count: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const day = new Date()
      day.setDate(day.getDate() - i)
      day.setHours(0, 0, 0, 0)
      const dayEnd = new Date(day)
      dayEnd.setDate(dayEnd.getDate() + 1)
      const count = recentUsers.filter(u => u.createdAt >= day && u.createdAt < dayEnd).length
      signupsByDay.push({
        date: `${day.getMonth() + 1}/${day.getDate()}`,
        count,
      })
    }

    // Recent audit logs
    const recentActivity = await db.auditLog.findMany({
      take: 15,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      overview: {
        totalUsers,
        totalOrgs,
        totalBusinesses,
        paidSubscribers,
        trialUsers: trialOrgs.length,
        mrr,
        arr: mrr * 12,
      },
      planBreakdown,
      trialOrgs: trialOrgs.map(o => ({
        id: o.id,
        name: o.name,
        trialEndsAt: o.trialEndsAt?.toISOString(),
        createdAt: o.createdAt.toISOString(),
        daysLeft: Math.ceil((o.trialEndsAt!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      })),
      recentSignups: recentSignups.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        createdAt: u.createdAt.toISOString(),
        orgName: u.memberships[0]?.org.name || 'No org',
        plan: u.memberships[0]?.org.plan || 'FREE',
        isTrial: u.memberships[0]?.org.trialEndsAt ? u.memberships[0].org.trialEndsAt > now : false,
      })),
      usage: {
        totalReviews,
        totalDrafts,
        totalCampaigns,
        totalRequests,
        reviewsBySource: reviewsBySource.map(s => ({ source: s.source, count: s._count })),
      },
      signupsByDay,
      recentActivity: recentActivity.map(log => ({
        id: log.id,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        actorId: log.actorId,
        createdAt: log.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Admin API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch admin stats', details: String(error) },
      { status: 500 }
    )
  }
}
