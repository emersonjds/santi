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
