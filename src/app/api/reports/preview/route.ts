import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext, assertBusinessOwnership } from '@/lib/tenant-context'
import { isOrgAdminRole } from '@/lib/operator-governance'
import { generateExecutiveReportData } from '@/lib/reports/report-service'
import { renderExecutiveReportPdf } from '@/lib/reports/pdf-renderer'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// GET /api/reports/preview — Preview report data (JSON) or download rendered PDF
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext(request)
  if (ctx instanceof NextResponse) return ctx

  // Technical abuse prevention: Rate-limit manual preview generation (20/min per user)
  const rl = await rateLimit(`report_preview:${ctx.user.id}`, 20, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before generating additional report previews.', code: 'RATE_LIMIT_EXCEEDED' },
      { status: 429 }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined
    const schedule = searchParams.get('schedule') || undefined
    const timezone = searchParams.get('timezone') || undefined
    const format = searchParams.get('format')?.toLowerCase() || 'json'

    // Tenant authorization
    if (businessId) {
      const denied = assertBusinessOwnership(ctx, businessId)
      if (denied) return denied
    } else if (!isOrgAdminRole(ctx.user.role)) {
      // Lower role attempting to preview organization-wide data without business scope
      return NextResponse.json(
        { error: 'Only organization administrators can preview organization-wide reports', code: 'INSUFFICIENT_ROLE' },
        { status: 403 }
      )
    }

    const reportData = await generateExecutiveReportData({
      orgId: ctx.orgId,
      businessId: businessId || null,
      startDate,
      endDate,
      schedule,
      timezone,
    })

    if (format === 'pdf') {
      const pdfBuffer = renderExecutiveReportPdf(reportData)
      const sanitizedName = reportData.businessName.replace(/[^a-zA-Z0-9_-]/g, '_')
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="Executive-Report-${sanitizedName}.pdf"`,
          'Cache-Control': 'no-store, max-age=0',
        },
      })
    }

    return NextResponse.json({
      success: true,
      report: reportData,
    })
  } catch (error: any) {
    console.error('Report preview error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate report preview' },
      { status: 500 }
    )
  }
}
