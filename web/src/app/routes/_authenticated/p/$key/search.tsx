import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { ComingNextPage } from '@/pages/coming-next/coming-next-page'

export const Route = createFileRoute('/_authenticated/p/$key/search')({
  validateSearch: z.object({ q: z.string().optional().catch(undefined) }),
  component: () => <ComingNextPage title='Search' />,
})
