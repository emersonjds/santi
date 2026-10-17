/** A sprint instant as "Sep 1", read in local time. */
export const day = (instant: string) =>
  new Date(instant).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

/** The viewer's zone at `instant`: "EDT", "GMT-3". */
export const zoneName = (instant: Date) =>
  new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
    .formatToParts(instant)
    .find((part) => part.type === 'timeZoneName')!.value
