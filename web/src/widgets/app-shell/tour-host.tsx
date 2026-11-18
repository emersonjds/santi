import {
  Component,
  type ReactNode,
  Suspense,
  lazy,
  useEffect,
  useState,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { legalStatusQuery } from '@/entities/session/legal-queries'
import { onOpenTour } from '@/shared/lib/tour'

// Lazy: the tour, and its write, load only when it opens (D39, SAN-230 A4).
const WelcomeTour = lazy(() =>
  import('./welcome-tour').then((module) => ({ default: module.WelcomeTour }))
)

/** A tour that fails to load or render shows nothing; the shell stays. */
class Fallible extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError = () => ({ failed: true })
  render = () => (this.state.failed ? null : this.props.children)
}

/** Opens the tour once for an account that never closed it, once the terms are accepted; replays never write. */
export const TourHost = () => {
  const { user } = useRouteContext({ from: '/_authenticated' })
  const { data: legal } = useQuery(legalStatusQuery)
  const [mode, setMode] = useState<'first' | 'replay' | null>(
    user.tour_seen_at === null ? 'first' : null
  )
  useEffect(() => onOpenTour(() => setMode((open) => open ?? 'replay')), [])

  if (!mode || legal?.accepted !== true) return null
  return (
    <Fallible>
      <Suspense fallback={null}>
        <WelcomeTour first={mode === 'first'} onClose={() => setMode(null)} />
      </Suspense>
    </Fallible>
  )
}
