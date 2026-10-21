import { formatDate } from '@/shared/lib/format-date'
import { timeAgo } from './time-ago'

const WEEK = 7 * 86_400_000

const year = (instant: Date, timeZone?: string) =>
  formatDate(instant, { year: 'numeric' }, timeZone, 'en')

/** SAN-136 Q7: "2 hours ago" under 7 days, then "Oct 3", with the year when it is not this one. */
export const commentTime = (
  iso: string,
  timeZone?: string,
  now = Date.now()
) => {
  const date = new Date(iso)
  if (now - date.getTime() < WEEK) return timeAgo(iso, now)
  return formatDate(
    date,
    year(date, timeZone) === year(new Date(now), timeZone)
      ? { month: 'short', day: 'numeric' }
      : { dateStyle: 'medium' },
    timeZone,
    'en'
  )
}

/** "Oct 3, 2026, 2:05 PM". */
export const fullDateTime = (iso: string, timeZone?: string) =>
  formatDate(iso, { dateStyle: 'medium', timeStyle: 'short' }, timeZone, 'en')
