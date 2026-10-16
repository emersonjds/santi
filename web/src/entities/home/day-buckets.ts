export const BUCKETS = [
  'Today',
  'Yesterday',
  'This week',
  'This month',
  'Older',
] as const

export type Bucket = (typeof BUCKETS)[number]

const midnight = (date: Date, days = 0) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime()

/** Which list section a time falls in, in the viewer's time zone; weeks start on Monday. */
export const dayBucket = (iso: string, now = new Date()): Bucket => {
  const time = Date.parse(iso)
  const today = midnight(now)
  if (time >= today) return 'Today'
  if (time >= midnight(now, -1)) return 'Yesterday'
  if (time >= midnight(now, -((now.getDay() + 6) % 7))) return 'This week'
  if (time >= new Date(now.getFullYear(), now.getMonth(), 1).getTime())
    return 'This month'
  return 'Older'
}

/** Rows already newest first, split into buckets in order; empty buckets are left out. */
export const groupByDay = <Row extends { at: string }>(
  rows: Row[],
  now = new Date()
) =>
  BUCKETS.map((bucket) => ({
    bucket,
    items: rows.filter((row) => dayBucket(row.at, now) === bucket),
  })).filter((group) => group.items.length > 0)
