import {
  instantToZonedWallTime,
  zonedWallTimeToInstant,
} from '@/shared/lib/sprint-dates'

const MINUTE = 60_000

// D48: preset tokens shared with the server and the CLI.
export const PRESETS = [
  ['4h', '4 hours'],
  ['1d', '1 day'],
  ['1w', '1 week'],
  ['2w', '2 weeks'],
  ['1m', '1 month'],
] as const

export const CUSTOM = 'custom'

/** Calendar steps land on the same wall clock in the account's zone. */
export const sprintWindow = (
  start: Date,
  length: string,
  timeZone?: string
): Date => {
  if (length === '4h') return new Date(start.getTime() + 240 * MINUTE)
  const wall = instantToZonedWallTime(start, timeZone)
  const day = new Date(`${wall.day}T00:00Z`)
  const at = (time: string) =>
    zonedWallTimeToInstant(day.toISOString().slice(0, 10), time, timeZone)
  switch (length) {
    case '1d':
      return at('23:59')
    case '1w':
    case '2w':
      day.setUTCDate(day.getUTCDate() + (length === '1w' ? 7 : 14))
      return at(wall.time)
    case '1m': {
      const date = day.getUTCDate()
      day.setUTCDate(1)
      day.setUTCMonth(day.getUTCMonth() + 1)
      day.setUTCDate(
        Math.min(
          date,
          new Date(
            Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)
          ).getUTCDate()
        )
      )
      return at(wall.time)
    }
    default:
      return new Date(start.getTime() + Number(length) * MINUTE)
  }
}

export const customLength = (start: Date, end: Date) => {
  const minutes = Math.round((end.getTime() - start.getTime()) / MINUTE)
  return minutes >= 1 && minutes <= 9_999_999 ? String(minutes) : null
}

export const fromInputs = (
  day: string,
  time: string,
  fallback: '00:00' | '23:59',
  timeZone?: string
) => zonedWallTimeToInstant(day, time || fallback, timeZone)

export const nowToTheMinute = () => {
  const now = new Date()
  now.setSeconds(0, 0)
  return now
}
