import { createFileRoute } from '@tanstack/react-router'
import { LoginPage } from '@/pages/login/login-page'
import {
  parseRedirect,
  redirectSignedIn,
} from '@/entities/session/require-session'

export const Route = createFileRoute('/login')({
  // Plain validation keeps zod out of the first-visit bundle (D39).
  validateSearch: parseRedirect,
  beforeLoad: ({ context, search }) =>
    redirectSignedIn(context.queryClient, search.redirect),
  component: LoginPage,
})
