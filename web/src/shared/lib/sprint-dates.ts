import { formatDate } from './format-date'

const MINUTE = 60_000
const HOUR_MINUTES = 60
const DAY_MINUTES = 1440

export const zoneName = (instant: Date, timeZone?: string) =>
  new Intl.DateTimeFormat('en-US', { timeZoneName: 'short', timeZone })
    .formatToParts(instant)
    .find((part) => part.type === 'timeZoneName')!.value

const day = (instant: Date, timeZone?: string) =>
  formatDate(instant, { month: 'short', day: 'numeric' }, timeZone, 'en-US')

const minuteOfDay = (instant: Date, timeZone?: string) => {
  const clock = formatDate(
    instant,
    { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
    timeZone,
    'en-US'
  )
  return Number(clock.slice(0, 2)) * HOUR_MINUTES + Number(clock.slice(3))
}

export const formatRange = (
  startsAt: string,
  endsAt: string,
  hourCycle = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
  }).resolvedOptions().hourCycle,
  timeZone?: string
) => {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const date = (instant: Date) =>
    formatDate(instant, { dateStyle: 'short' }, timeZone)
  const sameDay = date(start) === date(end)
  if (
    minuteOfDay(start, timeZone) === 0 &&
    minuteOfDay(end, timeZone) === DAY_MINUTES - 1
  )
    return sameDay
      ? day(start, timeZone)
      : `${day(start, timeZone)} – ${day(end, timeZone)}`
  const time = (instant: Date) =>
    formatDate(
      instant,
      {
        hour:
          hourCycle === 'h11' || hourCycle === 'h12' ? 'numeric' : '2-digit',
        minute: '2-digit',
        hourCycle,
      },
      timeZone,
      'en-US'
    )
  const until = sameDay ? time(end) : `${day(end, timeZone)}, ${time(end)}`
  return `${day(start, timeZone)}, ${time(start)} – ${until} ${zoneName(end, timeZone)}`
}

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
