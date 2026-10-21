const known = new Map<string, boolean>()

/** The zone, or `undefined` (the browser's) when this browser's ICU lacks it: the server accepts newer tzdb names. */
export const safeTimeZone = (timeZone?: string) => {
  if (timeZone === undefined) return undefined
  if (!known.has(timeZone)) {
    try {
      new Intl.DateTimeFormat(undefined, { timeZone })
      known.set(timeZone, true)
    } catch {
      known.set(timeZone, false)
    }
  }
  return known.get(timeZone) ? timeZone : undefined
}

/** SAN-93: dates in the account's zone; no zone means the browser's. */
export const formatDate = (
  instant: Date | string,
  options: Intl.DateTimeFormatOptions,
  timeZone?: string,
  locale?: string
) =>
  new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: safeTimeZone(timeZone),
  }).format(new Date(instant))

/** The `YYYY-MM-DD` and `HH:MM` an instant reads as on a wall clock in the zone, the native date and time inputs' values. */
export const instantToZonedWallTime = (instant: Date, timeZone?: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: safeTimeZone(timeZone),
    })
      .formatToParts(instant)
      .map(({ type, value }) => [type, value])
  )
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  }
}

const offsetAt = (instant: number, timeZone?: string) => {
  const { day, time } = instantToZonedWallTime(new Date(instant), timeZone)
  return Date.parse(`${day}T${time}Z`) - instant
}

/** The instant a wall clock in the zone shows `day` at `time`; a time the clocks skip moves forward by the gap. */
export const zonedWallTimeToInstant = (
  day: string,
  time: string,
  timeZone?: string
) => {
  const wall = Date.parse(`${day}T${time}Z`)
  return new Date(wall - offsetAt(wall - offsetAt(wall, timeZone), timeZone))
}
