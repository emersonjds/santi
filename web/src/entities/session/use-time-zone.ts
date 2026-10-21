import { useQuery } from '@tanstack/react-query'
import { sessionQuery } from './session-query'

/** SAN-93: the zone the account reads dates in; `undefined` is the browser's. */
export const useTimeZone = () =>
  useQuery(sessionQuery).data?.time_zone ?? undefined
