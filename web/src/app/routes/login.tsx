import { createFileRoute } from '@tanstack/react-router'
import { LoginPage } from '@/pages/login/login-page'
import { redirectSignedIn } from '@/entities/session/require-session'

// Same-site paths only: `//host` or `https://…` would send the user off santi.
const sameSitePath = (value: unknown) =>
  typeof value === 'string' && /^\/(?!\/)/.test(value) ? value : undefined

export const Route = createFileRoute('/login')({
  // Plain validation keeps zod out of the first-visit bundle (D39).
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: sameSitePath(search.redirect),
  }),
  beforeLoad: ({ context, search }) =>
    redirectSignedIn(context.queryClient, search.redirect),
  component: LoginPage,
})
