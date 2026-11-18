import { Suspense, lazy, useEffect, useState } from 'react'
import { useRouteContext } from '@tanstack/react-router'
import { onOpenTour } from '@/shared/lib/tour'

// Lazy: the tour, and its write, load only when it opens (D39, SAN-230 A4).
const WelcomeTour = lazy(() =>
  import('./welcome-tour').then((module) => ({ default: module.WelcomeTour }))
)

/** Opens the tour once for an account that never closed it; replays never write. */
export const TourHost = () => {
  const { user } = useRouteContext({ from: '/_authenticated' })
  const [mode, setMode] = useState<'first' | 'replay' | null>(
    user.tour_seen_at === null ? 'first' : null
  )
  useEffect(() => onOpenTour(() => setMode((open) => open ?? 'replay')), [])

  if (!mode) return null
  return (
    <Suspense fallback={null}>
      <WelcomeTour first={mode === 'first'} onClose={() => setMode(null)} />
    </Suspense>
  )
}
