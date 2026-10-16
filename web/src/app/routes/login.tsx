import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { LoginPage } from '@/pages/login/login-page'

const search = z.object({
  // Same-site paths only: `//host` or `https://…` would send the user off santi.
  redirect: z
    .string()
    .regex(/^\/(?!\/)/)
    .optional()
    .catch(undefined),
})

export const Route = createFileRoute('/login')({
  validateSearch: search,
  component: LoginPage,
})
