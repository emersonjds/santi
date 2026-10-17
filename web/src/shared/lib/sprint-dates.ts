const MINUTE = 60_000
const HOUR_MINUTES = 60
const DAY_MINUTES = 1440

/** The viewer's zone at `instant`: "EDT", "GMT-3". */
export const zoneName = (instant: Date) =>
  new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
    .formatToParts(instant)
    .find((part) => part.type === 'timeZoneName')!.value

const day = (instant: Date) =>
  instant.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const minuteOfDay = (instant: Date) =>
  instant.getHours() * HOUR_MINUTES + instant.getMinutes()

/** "Oct 1 – Oct 14" for whole local days, else "Oct 16, 09:00 – 22:00 EDT" with the times in the viewer's hour cycle. */
export const formatRange = (
  startsAt: string,
  endsAt: string,
  hourCycle = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
  }).resolvedOptions().hourCycle
) => {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const sameDay = start.toDateString() === end.toDateString()
  if (minuteOfDay(start) === 0 && minuteOfDay(end) === DAY_MINUTES - 1)
    return sameDay ? day(start) : `${day(start)} – ${day(end)}`
  const time = (instant: Date) =>
    instant.toLocaleTimeString('en-US', {
      hour: hourCycle === 'h11' || hourCycle === 'h12' ? 'numeric' : '2-digit',
      minute: '2-digit',
      hourCycle,
    })
  const until = sameDay ? time(end) : `${day(end)}, ${time(end)}`
  return `${day(start)}, ${time(start)} – ${until} ${zoneName(end)}`
}

/** "3 days left", "5h 20m left", "20m left"; from the end on "Overdue", then "Overdue by 20m" / "2h" / "3 days". */
export const timeLeft = (now: number, endsAt: string) => {
  const diff = Date.parse(endsAt) - now
  if (diff > 0) {
    const minutes = Math.ceil(diff / MINUTE)
    if (minutes >= DAY_MINUTES) {
      const days = Math.floor(minutes / DAY_MINUTES)
      return {
        overdue: false,
        text: days === 1 ? '1 day left' : `${days} days left`,
      }
    }
    const hours = Math.floor(minutes / HOUR_MINUTES)
    const rest = minutes % HOUR_MINUTES
    const text =
      hours === 0
        ? `${rest}m left`
        : rest === 0
          ? `${hours}h left`
          : `${hours}h ${rest}m left`
    return { overdue: false, text }
  }
  const late = Math.floor(-diff / MINUTE)
  if (late < 1) return { overdue: true, text: 'Overdue' }
  if (late < HOUR_MINUTES) return { overdue: true, text: `Overdue by ${late}m` }
  if (late < DAY_MINUTES)
    return {
      overdue: true,
      text: `Overdue by ${Math.floor(late / HOUR_MINUTES)}h`,
    }
  const days = Math.floor(late / DAY_MINUTES)
  return {
    overdue: true,
    text: days === 1 ? 'Overdue by 1 day' : `Overdue by ${days} days`,
  }
}
