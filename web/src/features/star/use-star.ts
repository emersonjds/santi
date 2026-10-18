import type { InfiniteData } from '@tanstack/react-query'
import { myIssuesQuery, myProjectsQuery } from '@/entities/home/home-queries'
import {
  type HomeIssue,
  type MyProject,
  api,
  okOrThrow,
} from '@/shared/api/client'
import { useOptimisticWrite } from '@/shared/lib/optimistic-write'

type Toggle = { key: string; starred: boolean }

const writeStar = async ({ key, starred }: Toggle) =>
  okOrThrow(
    starred
      ? await api.POST('/api/me/stars', { body: { key } })
      : await api.DELETE('/api/me/stars/{key}', { params: { path: { key } } })
  )

const failure = ({ key, starred }: Toggle) =>
  `${key} was not ${starred ? 'starred' : 'unstarred'}`

const ISSUES_KEY = myIssuesQuery('recommended').queryKey.slice(0, 2)

/** D37: every home list flips the star at once; a failure puts it back. */
export const useStarIssue = () =>
  useOptimisticWrite<InfiniteData<{ items: HomeIssue[] }>, Toggle>({
    queryKey: ISSUES_KEY,
    write: writeStar,
    change: (view, { key, starred }) => ({
      ...view,
      pages: view.pages.map((page) => ({
        ...page,
        items: page.items.map((issue) =>
          issue.key === key ? { ...issue, starred } : issue
        ),
      })),
    }),
    failure,
  })

export const useStarProject = () =>
  useOptimisticWrite<MyProject[], Toggle>({
    queryKey: myProjectsQuery.queryKey,
    write: writeStar,
    change: (projects, { key, starred }) =>
      projects.map((project) =>
        project.key === key
          ? {
              ...project,
              starred,
              starred_at: starred ? new Date().toISOString() : null,
            }
          : project
      ),
    failure,
  })
