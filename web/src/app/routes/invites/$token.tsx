import { createFileRoute } from '@tanstack/react-router'
import { JoinPage } from '@/pages/join/join-page'
import { requireSession } from '@/entities/session/require-session'

export const Route = createFileRoute('/invites/$token')({
  beforeLoad: ({ context, location }) =>
    requireSession(context.queryClient, location.href),
  component: JoinPage,
})
