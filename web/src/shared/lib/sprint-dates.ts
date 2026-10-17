/** A sprint date (`YYYY-MM-DD`, no time zone) as "Sep 1", read in local time. */
export const day = (date: string) =>
  new Date(`${date}T00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
