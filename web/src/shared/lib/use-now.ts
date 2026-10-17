import { useEffect, useState } from 'react'

const MINUTE = 60_000

/** The current time, refreshed on each minute boundary. */
export const useNow = () => {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(
        () => {
          setNow(Date.now())
          schedule()
        },
        MINUTE - (Date.now() % MINUTE)
      )
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])
  return now
}
