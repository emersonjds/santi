/** SAN-93: dates in the account's zone; no zone means the browser's. */
export const formatDate = (
  instant: Date | string,
  options: Intl.DateTimeFormatOptions,
  timeZone?: string,
  locale?: string
) =>
  new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(
    new Date(instant)
  )
