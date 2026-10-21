const ago = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const UNITS = [
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
] as const

/** "3 hours ago", "yesterday", "now". */
export const timeAgo = (iso: string, now = Date.now()) => {
  const seconds = (Date.parse(iso) - now) / 1000
  for (const [unit, size] of UNITS)
    if (Math.abs(seconds) >= size)
      return ago.format(Math.round(seconds / size), unit)
  return ago.format(0, 'second')
}

/** Whole days since `iso`: 5 for a card last touched five and a half days ago. */
export const daysSince = (iso: string, now = Date.now()) =>
  Math.floor((now - Date.parse(iso)) / 86_400_000)
