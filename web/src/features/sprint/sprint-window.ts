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

export const sprintWindow = (start: Date, length: string): Date => {
  const end = new Date(start)
  switch (length) {
    case '4h':
      return new Date(start.getTime() + 240 * MINUTE)
    case '1d':
      end.setHours(23, 59, 0, 0)
      return end
    case '1w':
    case '2w':
      end.setDate(end.getDate() + (length === '1w' ? 7 : 14))
      return end
    case '1m': {
      const day = end.getDate()
      end.setDate(1)
      end.setMonth(end.getMonth() + 1)
      end.setDate(
        Math.min(
          day,
          new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()
        )
      )
      return end
    }
    default:
      return new Date(start.getTime() + Number(length) * MINUTE)
  }
}

export const customLength = (start: Date, end: Date) => {
  const minutes = Math.round((end.getTime() - start.getTime()) / MINUTE)
  return minutes >= 1 && minutes <= 9_999_999 ? String(minutes) : null
}

// Swedish formats read YYYY-MM-DD and HH:MM, the native inputs' values.
export const toInputs = (instant: Date) => ({
  day: instant.toLocaleDateString('sv'),
  time: instant.toLocaleTimeString('sv', {
    hour: '2-digit',
    minute: '2-digit',
  }),
})

export const fromInputs = (
  day: string,
  time: string,
  fallback: '00:00' | '23:59'
) => new Date(`${day}T${time || fallback}`)

export const nowToTheMinute = () => {
  const now = new Date()
  now.setSeconds(0, 0)
  return now
}
