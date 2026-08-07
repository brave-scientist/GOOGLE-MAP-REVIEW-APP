import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// POST /api/reports/create — Create a scheduled report
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
      const { name, schedule, recipients, format, channel } = body

      if (!name || !schedule) {
        return NextResponse.json({ error: 'name and schedule are required' }, { status: 400 })
      }

      // Store as audit log entry (in production, create a scheduled_reports table)
      const report = {
        id: `rpt_${Date.now().toString(36)}`,
        name,
        schedule, // daily | weekly | monthly
        recipients: recipients || [user.email],
        format: format || 'email',
        channel: channel || 'email',
        status: 'active',
        createdAt: new Date().toISOString(),
      }

      await db.auditLog.create({
        data: {
          actorId: user.id,
          action: 'report.created',
          targetType: 'report',
          targetId: report.id,
          metadata: JSON.stringify(report),
        },
      })

      return NextResponse.json({
        success: true,
        report,
        message: `Report "${name}" created. Schedule: ${schedule}. Recipients: ${report.recipients.length}. The report will be sent ${schedule} once email sending is configured.`,
      })
  } catch (error) {
    console.error('Report create error:', error)
    return NextResponse.json({ error: 'Failed to create report' }, { status: 500 })
  }
}

// PUT /api/reports/update — Update an existing report
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const { reportId, name, schedule, recipients, status } = body

    if (!reportId) {
      return NextResponse.json({ error: 'reportId is required' }, { status: 400 })
    }

    const update = {
      reportId,
      name: name || '(unchanged)',
      schedule: schedule || '(unchanged)',
      recipients: recipients || [],
      status: status || 'active',
      updatedAt: new Date().toISOString(),
    }

    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: 'report.updated',
        targetType: 'report',
        targetId: reportId,
        metadata: JSON.stringify(update),
      },
    })

    return NextResponse.json({
      success: true,
      message: `Report updated. New schedule: ${update.schedule}. Status: ${update.status}.`,
    })
  } catch (error) {
    console.error('Report update error:', error)
    return NextResponse.json({ error: 'Failed to update report' }, { status: 500 })
  }
}
