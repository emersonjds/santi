import { useQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { sessionQuery } from './session-query'

/** The route context holds the user as of sign-in; the session cache follows later edits (SAN-93). */
export const useSignedInUser = () => {
  const { user } = useRouteContext({ from: '/_authenticated' })
  return useQuery(sessionQuery).data ?? user
}
