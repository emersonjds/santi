import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/p/$key/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/p/$key/board', params, replace: true })
  },
})
