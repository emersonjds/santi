import { createFileRoute } from '@tanstack/react-router'
import { ComingNextPage } from '@/pages/coming-next/coming-next-page'

export const Route = createFileRoute('/_authenticated/p/$key/board')({
  component: () => <ComingNextPage title='Board' />,
})
