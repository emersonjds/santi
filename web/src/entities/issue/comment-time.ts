import { timeAgo } from './time-ago'

const WEEK = 7 * 86_400_000
const thisYear = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
})
const otherYear = new Intl.DateTimeFormat('en', { dateStyle: 'medium' })
const full = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/** SAN-136 Q7: "2 hours ago" under 7 days, then "Oct 3", with the year when it is not this one. */
export const commentTime = (iso: string, now = Date.now()) => {
  const date = new Date(iso)
  if (now - date.getTime() < WEEK) return timeAgo(iso, now)
  return date.getFullYear() === new Date(now).getFullYear()
    ? thisYear.format(date)
    : otherYear.format(date)
}

/** "Oct 3, 2026, 2:05 PM". */
export const fullDateTime = (iso: string) => full.format(new Date(iso))
