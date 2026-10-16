import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'
import { sessionQuery } from './session-query'

export const requireSession = async (
  queryClient: QueryClient,
  returnTo: string
) => {
  const user = await queryClient.ensureQueryData(sessionQuery)
  if (!user) throw redirect({ to: '/login', search: { redirect: returnTo } })
  return user
}

export const redirectSignedIn = async (queryClient: QueryClient, to = '/') => {
  const user = await queryClient.ensureQueryData(sessionQuery)
  if (user) throw redirect({ to })
}

export const forgetSession = (queryClient: QueryClient) => {
  queryClient.clear()
  queryClient.setQueryData(sessionQuery.queryKey, null)
}

// Browsers read `\` as `/` and drop tabs and newlines from URLs: `/\host` and `/\t/host` leave the site too.
// eslint-disable-next-line no-control-regex -- control characters are what it looks for.
const UNSAFE = /[\\\u0000-\u001f\u007f]/

const sameSite = (path: string) =>
  path.startsWith('/') &&
  !path.startsWith('//') &&
  !UNSAFE.test(path) &&
  new URL(path, location.origin).origin === location.origin

/** `?redirect=`, same-site paths only: `//host` or `https://…` would send the user off santi. */
export const parseRedirect = (
  search: Record<string, unknown>
): { redirect?: string } => ({
  redirect:
    typeof search.redirect === 'string' && sameSite(search.redirect)
      ? search.redirect
      : undefined,
})
