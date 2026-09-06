/**
 * src/lib/reports/timezone-scheduler.ts
 *
 * Production-grade, IANA-compliant timezone scheduling engine for ReviewReply.pw.
 * Handles calendar-correct periods (DAILY, WEEKLY, MONTHLY), DST shifts,
 * half-hour/quarter-hour offsets (e.g. Asia/Kolkata UTC+5:30), month boundaries,
 * year boundaries, and server-authoritative nextRunAt calculation.
 */

import { ReportSchedule } from '@prisma/client'

/**
 * Validates whether a given string is a recognized IANA timezone identifier.
 */
export function isValidIanaTimezone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false
  const trimmed = timeZone.trim()
  if (trimmed.length === 0 || trimmed.length > 64) return false

  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed })
    return true
  } catch {
    return false
  }
}

export interface ZonedParts {
  year: number
  month: number // 1 to 12
  day: number // 1 to 31
  hour: number // 0 to 23
  minute: number // 0 to 59
  second: number // 0 to 59
  dayOfWeek: number // 0 (Sun) to 6 (Sat)
}

/**
 * Extracts local calendar date/time parts for a given instant and IANA timezone.
 */
export function getZonedDateParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
    hour12: false,
  })

  const parts = dtf.formatToParts(date)
  const partMap: Record<string, string> = {}
  for (const p of parts) {
    partMap[p.type] = p.value
  }

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }

  let hour = parseInt(partMap.hour || '0', 10)
  if (hour === 24) hour = 0

  return {
    year: parseInt(partMap.year, 10),
    month: parseInt(partMap.month, 10),
    day: parseInt(partMap.day, 10),
    hour,
    minute: parseInt(partMap.minute || '0', 10),
    second: parseInt(partMap.second || '0', 10),
    dayOfWeek: weekdayMap[partMap.weekday] ?? 0,
  }
}

/**
 * Converts local calendar date components in a specified IANA timezone into an exact UTC Date.
 * Handles DST boundaries and time offsets via iterative refinement.
 */
export function localToUtc(
  components: {
    year: number
    month: number // 1 to 12
    day: number // 1 to 31
    hour?: number // 0 to 23
    minute?: number // 0 to 59
    second?: number // 0 to 59
    millisecond?: number // 0 to 999
  },
  timeZone: string
): Date {
  const {
    year,
    month,
    day,
    hour = 0,
    minute = 0,
    second = 0,
    millisecond = 0,
  } = components

  // Initial guess assuming UTC
  let guessTime = Date.UTC(year, month - 1, day, hour, minute, second, millisecond)

  // Refine up to 3 times to account for non-linear DST shifts
  for (let i = 0; i < 3; i++) {
    const zoned = getZonedDateParts(new Date(guessTime), timeZone)
    const currentZonedTime = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second,
      millisecond
    )

    const diff = currentZonedTime - Date.UTC(year, month - 1, day, hour, minute, second, millisecond)
    if (diff === 0) break
    guessTime -= diff
  }

  return new Date(guessTime)
}

/**
 * Resolves standard calendar period boundaries for a report based on frequency and timezone.
 *
 * Period semantics:
 * - DAILY: Previous local calendar day (00:00:00.000 to 23:59:59.999 local).
 * - WEEKLY: Previous calendar week (Monday 00:00:00.000 to Sunday 23:59:59.999 local).
 * - MONTHLY: Previous full calendar month (1st 00:00:00.000 to last day 23:59:59.999 local).
 */
export function resolveCalendarReportPeriod(options: {
  schedule?: ReportSchedule | string
  timezone?: string
  referenceDate?: Date | string
  startDate?: Date | string
  endDate?: Date | string
}): {
  start: Date
  end: Date
  label: string
} {
  const tz = options.timezone && isValidIanaTimezone(options.timezone) ? options.timezone : 'UTC'

  // Explicit overrides take priority
  if (options.startDate && options.endDate) {
    const start = new Date(options.startDate)
    const end = new Date(options.endDate)
    const label = `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`
    return { start, end, label }
  }

  if (options.startDate) {
    const start = new Date(options.startDate)
    const end = options.endDate ? new Date(options.endDate) : new Date()
    const label = `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`
    return { start, end, label }
  }

  const now = options.referenceDate ? new Date(options.referenceDate) : new Date()
  const localNow = getZonedDateParts(now, tz)
  const sched = (options.schedule || 'WEEKLY').toUpperCase()

  if (sched === 'DAILY') {
    // Previous local calendar day: Day - 1
    // Local date 1 day prior
    const prevDayLocal = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day - 1, 12, 0, 0))
    const y = prevDayLocal.getUTCFullYear()
    const m = prevDayLocal.getUTCMonth() + 1
    const d = prevDayLocal.getUTCDate()

    const start = localToUtc({ year: y, month: m, day: d, hour: 0, minute: 0, second: 0, millisecond: 0 }, tz)
    const end = localToUtc({ year: y, month: m, day: d, hour: 23, minute: 59, second: 59, millisecond: 999 }, tz)
    const label = `Daily (${String(y)}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')})`
    return { start, end, label }
  }

  if (sched === 'WEEKLY') {
    // Previous calendar week: Monday to Sunday
    // In localNow, dayOfWeek: 0 = Sun, 1 = Mon, ..., 6 = Sat
    // Days since last Sunday: if today is Sun (0), 0; Mon (1), 1...
    // Previous Sunday is (dayOfWeek === 0 ? 7 : dayOfWeek) days ago.
    const daysSinceSunday = localNow.dayOfWeek === 0 ? 7 : localNow.dayOfWeek
    const prevSundayDate = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day - daysSinceSunday, 12, 0, 0))
    const prevMondayDate = new Date(Date.UTC(prevSundayDate.getUTCFullYear(), prevSundayDate.getUTCMonth(), prevSundayDate.getUTCDate() - 6, 12, 0, 0))

    const monY = prevMondayDate.getUTCFullYear()
    const monM = prevMondayDate.getUTCMonth() + 1
    const monD = prevMondayDate.getUTCDate()

    const sunY = prevSundayDate.getUTCFullYear()
    const sunM = prevSundayDate.getUTCMonth() + 1
    const sunD = prevSundayDate.getUTCDate()

    const start = localToUtc({ year: monY, month: monM, day: monD, hour: 0, minute: 0, second: 0, millisecond: 0 }, tz)
    const end = localToUtc({ year: sunY, month: sunM, day: sunD, hour: 23, minute: 59, second: 59, millisecond: 999 }, tz)

    const monStr = `${monY}-${String(monM).padStart(2, '0')}-${String(monD).padStart(2, '0')}`
    const sunStr = `${sunY}-${String(sunM).padStart(2, '0')}-${String(sunD).padStart(2, '0')}`
    const label = `Weekly (${monStr} to ${sunStr})`
    return { start, end, label }
  }

  if (sched === 'MONTHLY') {
    // Previous calendar month: e.g. If current is Sept 2026, prev is Aug 2026 (Aug 1 to Aug 31)
    // If current is Jan 2026, prev is Dec 2025 (Dec 1 to Dec 31)
    let prevMonth = localNow.month - 1
    let prevYear = localNow.year
    if (prevMonth === 0) {
      prevMonth = 12
      prevYear -= 1
    }

    // Days in prevMonth (using day 0 of month + 1)
    const daysInPrevMonth = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate()

    const start = localToUtc({ year: prevYear, month: prevMonth, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 }, tz)
    const end = localToUtc({ year: prevYear, month: prevMonth, day: daysInPrevMonth, hour: 23, minute: 59, second: 59, millisecond: 999 }, tz)

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const label = `Monthly (${monthNames[prevMonth - 1]} ${prevYear})`
    return { start, end, label }
  }

  // Fallback (REALTIME_ALERT or unknown)
  const end = now
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const label = `${sched} (${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)})`
  return { start, end, label }
}

/**
 * Derives authoritative server-calculated nextRunAt UTC instant based on schedule and timezone.
 * Never trusts arbitrary client-supplied nextRunAt.
 * Scheduled default dispatch time is 08:00 local time.
 */
export function calculateNextRunAt(params: {
  schedule: ReportSchedule | string
  timezone?: string
  referenceDate?: Date
  targetHour?: number // Default 8 AM local time
}): Date {
  const tz = params.timezone && isValidIanaTimezone(params.timezone) ? params.timezone : 'UTC'
  const now = params.referenceDate || new Date()
  const targetHour = params.targetHour ?? 8
  const sched = (params.schedule || 'WEEKLY').toUpperCase()

  if (sched === 'REALTIME_ALERT') {
    return new Date(now.getTime() + 15 * 60 * 1000)
  }

  const localNow = getZonedDateParts(now, tz)

  if (sched === 'DAILY') {
    // If today before targetHour, run today at targetHour
    // Else run tomorrow at targetHour
    let targetDay = localNow.day
    let targetMonth = localNow.month
    let targetYear = localNow.year

    if (localNow.hour >= targetHour) {
      // Advance 1 day
      const nextDay = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay + 1, 12, 0, 0))
      targetYear = nextDay.getUTCFullYear()
      targetMonth = nextDay.getUTCMonth() + 1
      targetDay = nextDay.getUTCDate()
    }

    return localToUtc({ year: targetYear, month: targetMonth, day: targetDay, hour: targetHour, minute: 0, second: 0 }, tz)
  }

  if (sched === 'WEEKLY') {
    // Run on Monday morning at targetHour
    // If today is Monday and before targetHour, run today.
    // Otherwise calculate next Monday.
    let daysUntilMonday = (1 - localNow.dayOfWeek + 7) % 7
    if (daysUntilMonday === 0 && localNow.hour >= targetHour) {
      daysUntilMonday = 7
    }

    const nextMon = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day + daysUntilMonday, 12, 0, 0))
    return localToUtc(
      {
        year: nextMon.getUTCFullYear(),
        month: nextMon.getUTCMonth() + 1,
        day: nextMon.getUTCDate(),
        hour: targetHour,
        minute: 0,
        second: 0,
      },
      tz
    )
  }

  if (sched === 'MONTHLY') {
    // Run on 1st of month at targetHour
    // If today is 1st and before targetHour, run today.
    // Otherwise run on 1st of next month.
    let targetMonth = localNow.month
    let targetYear = localNow.year

    if (localNow.day > 1 || (localNow.day === 1 && localNow.hour >= targetHour)) {
      targetMonth += 1
      if (targetMonth > 12) {
        targetMonth = 1
        targetYear += 1
      }
    }

    return localToUtc(
      {
        year: targetYear,
        month: targetMonth,
        day: 1,
        hour: targetHour,
        minute: 0,
        second: 0,
      },
      tz
    )
  }

  // Default fallback: 1 day later
  return new Date(now.getTime() + 24 * 60 * 60 * 1000)
}
