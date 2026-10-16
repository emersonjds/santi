import { createFileRoute } from '@tanstack/react-router'
import { ComingNextPage } from '@/pages/coming-next/coming-next-page'

// ponytail: stub until SAN-41 builds the issue dialog over the board.
export const Route = createFileRoute('/_authenticated/p/$key/issues/$number')({
  component: () => <ComingNextPage title='Issue' />,
})
