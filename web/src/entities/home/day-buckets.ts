import {
  instantToZonedWallTime,
  zonedWallTimeToInstant,
} from '@/shared/lib/sprint-dates'

export const BUCKETS = [
  'Today',
  'Yesterday',
  'This week',
  'This month',
  'Older',
] as const

export type Bucket = (typeof BUCKETS)[number]

const DAY = 86_400_000

const midnight = (day: Date, timeZone?: string) =>
  zonedWallTimeToInstant(day.toISOString().slice(0, 10), '00:00', timeZone)

/** Which list section a time falls in, in the account's time zone; weeks start on Monday. */
export const dayBucket = (
  iso: string,
  timeZone?: string,
  now = new Date()
): Bucket => {
  const time = new Date(iso)
  const today = new Date(`${instantToZonedWallTime(now, timeZone).day}T00:00Z`)
  const daysBack = (days: number) =>
    midnight(new Date(today.getTime() - days * DAY), timeZone)
  if (time >= daysBack(0)) return 'Today'
  if (time >= daysBack(1)) return 'Yesterday'
  if (time >= daysBack((today.getUTCDay() + 6) % 7)) return 'This week'
  if (
    time >=
    midnight(
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)),
      timeZone
    )
  )
    return 'This month'
  return 'Older'
}

/** Rows already newest first, split into buckets in order; empty buckets are left out. */
export const groupByDay = <Row extends { at: string }>(
  rows: Row[],
  timeZone?: string,
  now = new Date()
) =>
  BUCKETS.map((bucket) => ({
    bucket,
    items: rows.filter((row) => dayBucket(row.at, timeZone, now) === bucket),
  })).filter((group) => group.items.length > 0)
