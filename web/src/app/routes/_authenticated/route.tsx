import { createFileRoute } from '@tanstack/react-router'
import { requireSession } from '@/entities/session/require-session'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) =>
    requireSession(context.queryClient, location.href),
})
