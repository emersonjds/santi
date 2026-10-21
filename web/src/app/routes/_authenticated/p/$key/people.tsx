import { createFileRoute } from '@tanstack/react-router'
import { PeoplePage } from '@/pages/people/people-page'
import { peopleQuery } from '@/entities/project/project-queries'

export const Route = createFileRoute('/_authenticated/p/$key/people')({
  // Not awaited: the page draws its skeleton rows.
  loader: ({ context: { queryClient }, params }) => {
    void queryClient.prefetchQuery(peopleQuery(params.key))
  },
  component: PeoplePage,
})
