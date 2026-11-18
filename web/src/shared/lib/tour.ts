const OPEN_TOUR = 'santi:open-tour'

/** SAN-230: any layer replays the welcome tour; the app shell listens. */
export const openTour = () => {
  window.dispatchEvent(new Event(OPEN_TOUR))
}

export const onOpenTour = (listener: () => void) => {
  window.addEventListener(OPEN_TOUR, listener)
  return () => window.removeEventListener(OPEN_TOUR, listener)
}
